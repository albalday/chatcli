#!/usr/bin/env python3
"""
ZeroChat Professional Standalone Bundler & Gzip Base64 Compressor.
Compila los archivos modulares HTML, CSS y JS en un único archivo autónomo y portable 'zerochat.html'.

Características principales:
- Concatena todos los archivos JavaScript (.js) en un único cuerpo de código.
- Elimina comentarios (bloque y línea) de forma segura con un tokenizador FSM en Python puro,
  sin manipular ni alterar identificadores ni lógica AST previa.
- Comprime el JavaScript unificado utilizando la biblioteca estándar 'gzip' de Python
  al máximo nivel de compresión (compresslevel=9).
- Convierte los bytes comprimidos a Base64 y los inyecta en una etiqueta:
    <script type="application/gzip-base64" id="compressed-js">
- Incluye un cargador bootstrap nativo que descomprime el payload con DecompressionStream('gzip')
  en tiempo de ejecución en el navegador.
- Minificación integral de HTML estructural y estilos CSS.
- Verificación automática de integridad, descompresión y validación sintáctica post-build.
"""

import argparse
import base64
import gzip
import os
import re
import subprocess
import sys
import time
from typing import Dict, List, Optional, Tuple

JS_MODULE_FILES = [
    "cookies.js",
    "ragStorage.js",
    "file-system.js",
    "ingestionEngine.js",
    "chatService.js",
    "treeRagUI.js",
    "i18n.js",
    "sandbox.js",
    "charts.js",
    "web-browser.js",
    "web-search.js",
    "markdown.js",
    "providers.js",
    "api.js",
    "file-parser.js",
    "tools/tool-runtime.js",
    "tools/tool-manifest.js",
    "tools/builtin/execute-javascript.tool.js",
    "tools/builtin/search-web.tool.js",
    "tools/builtin/fetch-web-page.tool.js",
    "tools/builtin/download-pdf.tool.js",
    "tools/builtin/render-chart.tool.js",
    "tools/builtin/get-current-datetime.tool.js",
    "tools/builtin/list-documents.tool.js",
    "tools/builtin/search-knowledge-base.tool.js",
    "tools/builtin/read-chapter-content.tool.js",
    "agent-core.js",
    "mcp.js",
    "debug.js",
    "tool-cards.js",
    "attachments.js",
    "export.js",
    "state.js",
    "context-manager.js",
    "chat-engine.js",
    "ui-reasoning.js",
    "ui-inspector.js",
    "ui-sidebar.js",
    "app.js"
]

CORE_EXPORT_SYMBOLS = [
    "ChatStorage",
    "ChatRagStorage",
    "ChatFileSystem",
    "ChatIngestionEngine",
    "ChatTreeRagService",
    "ChatTreeRagUI",
    "ChatI18n",
    "ChatSandbox",
    "ChatCharts",
    "ChatWebBrowser",
    "ChatWebSearch",
    "ChatMarkdown",
    "ChatProviders",
    "ChatAPI",
    "ChatFileParser",
    "ChatToolRuntime",
    "ChatToolManifest",
    "ChatBuiltinExecuteJavascriptTool",
    "ChatBuiltinSearchWebTool",
    "ChatBuiltinFetchWebPageTool",
    "ChatBuiltinDownloadPdfTool",
    "ChatAgentCore",
    "ChatMCP",
    "ChatDebug",
    "ChatToolCards",
    "ChatAttachments",
    "ChatExport",
    "ChatState",
    "ChatContextManager",
    "ChatEngine",
    "ChatUIReasoning",
    "ChatUIInspector",
    "ChatUISidebar"
]

BOOTSTRAP_LOADER_SCRIPT = """<script>
(async () => {
  try {
    // 1. Leer el string Base64 de la etiqueta #compressed-js
    const el = document.getElementById('compressed-js');
    if (!el) throw new Error('Elemento #compressed-js no encontrado.');
    const b64 = el.textContent.trim();

    // 2. Decodificar Base64 a Uint8Array
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    // 3. Descomprimir utilizando la API nativa DecompressionStream('gzip')
    const ds = new DecompressionStream('gzip');
    const stream = new Blob([bytes], { type: 'application/gzip' }).stream().pipeThrough(ds);

    // 4. Convertir el stream resultante a texto
    const jsCode = await new Response(stream).text();

    // 5. Inyectar en el DOM como un nuevo nodo <script> para ejecución
    const script = document.createElement('script');
    script.textContent = jsCode;
    document.body.appendChild(script);
  } catch (err) {
    console.error('Error al inicializar JavaScript comprimido:', err);
  }
})();
</script>"""


def minify_html(html: str, mode: str = "prod") -> str:
    """
    Minifica el marcado HTML preservando bloques de texto sensible (<pre>, <textarea>, <code>).
    """
    if mode == "dev":
        return html

    preserved_blocks: Dict[str, str] = {}

    def save_block(match: re.Match) -> str:
        key = f"___PRESERVED_HTML_BLOCK_{len(preserved_blocks)}___"
        preserved_blocks[key] = match.group(0)
        return key

    # 1. Preservar bloques pre, textarea y code
    processed = re.sub(
        r'<(pre|textarea|code)[^>]*>[\s\S]*?</\1>',
        save_block,
        html,
        flags=re.IGNORECASE
    )

    # 2. Eliminar comentarios HTML (excepto condicionales IE)
    processed = re.sub(r'<!--(?!\s*\[if)[\s\S]*?-->', '', processed)

    # 3. Colapsar espacios y saltos de línea entre etiquetas contiguas
    processed = re.sub(r'>\s+<', '><', processed)

    # 4. Colapsar múltiples espacios consecutivos a uno solo
    processed = re.sub(r'[ \t\r\n]{2,}', ' ', processed)

    # 5. Restaurar bloques intactos
    for placeholder, original in preserved_blocks.items():
        processed = processed.replace(placeholder, original)

    return processed.strip()


def minify_css_external(css: str) -> Optional[str]:
    """
    Intenta minificar CSS utilizando esbuild si está disponible en el entorno.
    """
    try:
        res = subprocess.run(
            ['npx', '--yes', 'esbuild', '--minify', '--loader=css'],
            input=css,
            capture_output=True,
            text=True,
            check=True
        )
        if res.stdout and res.stdout.strip():
            return res.stdout.strip()
    except Exception:
        pass
    return None


def minify_css_fallback(css: str) -> str:
    """
    Minificador CSS seguro en Python puro.
    Optimiza comentarios, espacios, ceros innecesarios y colores hexadecimales.
    """
    css_clean = re.sub(r'/\*[\s\S]*?\*/', '', css)
    css_clean = re.sub(r'\s+', ' ', css_clean)
    css_clean = re.sub(r'\s*([{}:;,>+~])\s*', r'\1', css_clean)
    css_clean = re.sub(r';\}', '}', css_clean)
    css_clean = re.sub(r'(?<![\d\w%])0(?:px|em|rem|pt|in|cm|mm)', '0', css_clean)
    css_clean = re.sub(r'#([0-9a-fA-F])\1([0-9a-fA-F])\2([0-9a-fA-F])\3(?![0-9a-fA-F])', r'#\1\2\3', css_clean)
    return css_clean.strip()


def strip_js_comments(js: str) -> str:
    """
    Tokenizador léxico de JavaScript basado en máquina de estados finitos (FSM) en Python puro.
    Elimina exclusivamente comentarios (// y /* */) y líneas vacías sin alterar identificadores,
    cadenas ni lógica previa:
      - Cadenas con comillas simples ('...') o dobles ("...")
      - Template Literals (`...`) incluyendo expresiones anidadas ${...}
      - Expresiones Regulares literales (/.../flags)
      - Operadores de división (a / b)
      - Reglas de Automatic Semicolon Insertion (ASI)
    """
    output: List[str] = []
    i = 0
    n = len(js)
    stack: List[str] = []

    REGEX_PRECEDING_WORDS = {
        'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'delete',
        'void', 'throw', 'yield', 'else', 'do', 'new'
    }
    REGEX_PRECEDING_CHARS = set('({[=,:;!&|?+-*%/^~<>')

    last_non_space = ''
    last_word = ''

    while i < n:
        c = js[i]

        # 1. Cadena de comilla simple ('...')
        if c == "'":
            start = i
            i += 1
            while i < n and js[i] != "'":
                if js[i] == '\\':
                    i += 2
                elif js[i] == '\n':
                    break
                else:
                    i += 1
            i += 1
            output.append(js[start:i])
            last_non_space = "'"
            last_word = ''
            continue

        # 2. Cadena de comilla doble ("...")
        if c == '"':
            start = i
            i += 1
            while i < n and js[i] != '"':
                if js[i] == '\\':
                    i += 2
                elif js[i] == '\n':
                    break
                else:
                    i += 1
            i += 1
            output.append(js[start:i])
            last_non_space = '"'
            last_word = ''
            continue

        # 3. Template Literals (`...`)
        if c == '`':
            start = i
            i += 1
            stack.append('TEMPLATE_LITERAL')
            while i < n and stack and stack[-1] == 'TEMPLATE_LITERAL':
                if js[i] == '\\':
                    i += 2
                elif js[i] == '`':
                    stack.pop()
                    i += 1
                    break
                elif js[i] == '$' and i + 1 < n and js[i+1] == '{':
                    i += 2
                    stack.append('TEMPLATE_EXPR')
                    output.append(js[start:i])
                    start = i
                    break
                else:
                    i += 1
            if not stack or stack[-1] != 'TEMPLATE_EXPR':
                output.append(js[start:i])
            last_non_space = '`'
            last_word = ''
            continue

        # Salida o anidamiento de expresiones dentro de Template Literals
        if c == '}' and stack:
            if stack[-1] == 'TEMPLATE_EXPR':
                stack.pop()
                output.append('}')
                i += 1
                start = i
                while i < n and stack and stack[-1] == 'TEMPLATE_LITERAL':
                    if js[i] == '\\':
                        i += 2
                    elif js[i] == '`':
                        stack.pop()
                        i += 1
                        break
                    elif js[i] == '$' and i + 1 < n and js[i+1] == '{':
                        i += 2
                        stack.append('TEMPLATE_EXPR')
                        break
                    else:
                        i += 1
                output.append(js[start:i])
                last_non_space = '`' if (not stack or stack[-1] != 'TEMPLATE_EXPR') else '}'
                last_word = ''
                continue
            elif stack[-1] == 'BRACE':
                stack.pop()
                output.append('}')
                i += 1
                last_non_space = '}'
                last_word = ''
                continue

        if c == '{':
            if stack and stack[-1] == 'TEMPLATE_EXPR':
                stack.append('BRACE')
            output.append('{')
            i += 1
            last_non_space = '{'
            last_word = ''
            continue

        # 4. Comentario de una línea (// ...)
        if c == '/' and i + 1 < n and js[i+1] == '/':
            i += 2
            while i < n and js[i] != '\n':
                i += 1
            output.append('\n')  # Preservar salto de línea para ASI
            last_non_space = '\n'
            last_word = ''
            continue

        # 5. Comentario de bloque (/* ... */)
        if c == '/' and i + 1 < n and js[i+1] == '*':
            i += 2
            while i + 1 < n and not (js[i] == '*' and js[i+1] == '/'):
                i += 1
            i += 2
            output.append(' ')  # Espacio para evitar fusionar identificadores contiguos
            continue

        # 6. Expresión Regular Literal vs Operador de División
        if c == '/':
            is_regex = False
            if not last_non_space or last_non_space in REGEX_PRECEDING_CHARS:
                is_regex = True
            elif last_word in REGEX_PRECEDING_WORDS:
                is_regex = True

            if is_regex:
                start = i
                i += 1
                in_char_class = False
                while i < n:
                    if js[i] == '\\':
                        i += 2
                    elif js[i] == '[':
                        in_char_class = True
                        i += 1
                    elif js[i] == ']' and in_char_class:
                        in_char_class = False
                        i += 1
                    elif js[i] == '/' and not in_char_class:
                        i += 1
                        break
                    elif js[i] == '\n':
                        break
                    else:
                        i += 1
                while i < n and js[i].isalnum():
                    i += 1
                output.append(js[start:i])
                last_non_space = '/'
                last_word = ''
                continue
            else:
                output.append('/')
                i += 1
                last_non_space = '/'
                last_word = ''
                continue

        # 7. Caracteres generales
        output.append(c)
        if not c.isspace():
            last_non_space = c
            if c.isalnum() or c in '_$':
                last_word += c
            else:
                last_word = ''
        else:
            if c == '\n':
                last_non_space = '\n'
            last_word = ''
        i += 1

    code = ''.join(output)

    # Colapsar líneas vacías múltiples respetando los saltos necesarios
    lines = code.split('\n')
    cleaned_lines: List[str] = []
    for line in lines:
        if line.strip():
            cleaned_lines.append(line)
        elif cleaned_lines and cleaned_lines[-1] != '':
            cleaned_lines.append('')

    return '\n'.join(cleaned_lines)


def compress_js_to_gzip_base64(js_code: str) -> Tuple[str, int, int]:
    """
    Comprime el código JavaScript usando la biblioteca estándar gzip con el nivel máximo (9)
    y lo codifica en Base64.
    Retorna (base64_string, bytes_gzip, bytes_base64).
    """
    raw_bytes = js_code.encode("utf-8")
    compressed_bytes = gzip.compress(raw_bytes, compresslevel=9)
    b64_string = base64.b64encode(compressed_bytes).decode("ascii")
    return b64_string, len(compressed_bytes), len(b64_string.encode("ascii"))


def verify_bundle(html_content: str, verbose: bool = False) -> Tuple[bool, List[str]]:
    """
    Verifica la integridad del archivo distribuible generado:
    1. Estructura HTML básica.
    2. Ausencia de referencias externas a archivos locales.
    3. Presencia del payload comprimido o script JS.
    4. Descompresión gzip/Base64 y presencia de todos los módulos.
    5. Validación de sintaxis JavaScript embebido con Node.js.
    """
    errors: List[str] = []

    # 1. Estructura HTML básica
    required_tags = ['<!DOCTYPE html>', '<html', '<head', '</head>', '<body', '</body>', '</html>', '<style>', '</style>']
    for tag in required_tags:
        if tag.lower() not in html_content.lower():
            errors.append(f"Falta la etiqueta requerida '{tag}' en el documento generado.")

    # 2. Ausencia de referencias a scripts/css externos locales
    if re.search(r'<script[^>]*src=["\']js/[^"\']+["\'][^>]*>', html_content, re.IGNORECASE):
        errors.append("El archivo generado aún contiene etiquetas <script src=\"js/...\"> sin embeber.")

    if re.search(r'<link[^>]*href=["\']css/[^"\']+["\'][^>]*>', html_content, re.IGNORECASE):
        errors.append("El archivo generado aún contiene etiquetas <link href=\"css/...\"> sin embeber.")

    # 3. Extraer el código JavaScript (desde gzip Base64 o script plano)
    decompressed_js = ""
    compressed_match = re.search(
        r'<script[^>]*type=["\']application/gzip-base64["\'][^>]*id=["\']compressed-js["\'][^>]*>(.*?)</script>',
        html_content,
        re.DOTALL | re.IGNORECASE
    )

    if compressed_match:
        try:
            b64_payload = compressed_match.group(1).strip()
            gzip_bytes = base64.b64decode(b64_payload)
            decompressed_js = gzip.decompress(gzip_bytes).decode("utf-8")
        except Exception as e:
            errors.append(f"Error al decodificar o descomprimir el payload gzip Base64: {e}")
    else:
        # Fallback a script regular (ej: modo dev)
        script_match = re.search(r'<script(?![^>]*\btype=)[^>]*>(.*?)</script>', html_content, re.DOTALL)
        if script_match:
            decompressed_js = script_match.group(1)
        else:
            errors.append("No se encontró el payload JavaScript embebido (<script id=\"compressed-js\"> o <script>) en el HTML final.")

    # 4. Verificar presencia de símbolos y módulos clave
    if decompressed_js:
        for symbol in CORE_EXPORT_SYMBOLS:
            if symbol not in decompressed_js:
                errors.append(f"El símbolo o módulo esencial '{symbol}' no fue encontrado en el bundle final.")

        # 5. Validación de sintaxis en Node.js si está disponible
        try:
            val_res = subprocess.run(
                ['node', '-c'],
                input=decompressed_js,
                capture_output=True,
                text=True
            )
            if val_res.returncode != 0:
                errors.append(f"Error de sintaxis detectado en el JavaScript embebido: {val_res.stderr.strip()}")
            elif verbose:
                print("   ✅ Validación sintáctica con Node.js: Correcta y sin errores.")
        except FileNotFoundError:
            pass

    return len(errors) == 0, errors


def build_standalone_html(mode: str = "prod", force_fallback: bool = False, verbose: bool = False, output_file: Optional[str] = None) -> bool:
    """
    Ejecuta el pipeline completo de compilación, compresión Gzip Base64 y generación del bundle autónomo.
    """
    start_time = time.time()
    base_dir = os.path.dirname(os.path.abspath(__file__))

    index_path = os.path.join(base_dir, "index.html")
    css_path = os.path.join(base_dir, "css", "styles.css")
    js_dir = os.path.join(base_dir, "js")
    output_path = os.path.abspath(output_file) if output_file else os.path.join(base_dir, "zerochat.html")

    if not os.path.exists(index_path):
        print(f"❌ Error: Archivo base no encontrado: {index_path}", file=sys.stderr)
        return False

    # 1. Cargar HTML
    with open(index_path, "r", encoding="utf-8") as f:
        raw_html = f.read()
    raw_html_size = len(raw_html.encode("utf-8"))

    # 2. Cargar y procesar CSS
    raw_css = ""
    if os.path.exists(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            raw_css = f.read()
    raw_css_size = len(raw_css.encode("utf-8"))

    css_engine = "Python Fallback"
    if mode == "dev":
        css_min = raw_css
        css_engine = "Unminified (Dev)"
    elif not force_fallback:
        css_ext = minify_css_external(raw_css)
        if css_ext is not None:
            css_min = css_ext
            css_engine = "esbuild CSS"
        else:
            css_min = minify_css_fallback(raw_css)
    else:
        css_min = minify_css_fallback(raw_css)

    min_css_size = len(css_min.encode("utf-8"))

    # 3. Cargar y concatenar todos los archivos JavaScript (.js)
    raw_js_parts: List[str] = []
    missing_files: List[str] = []

    for jf in JS_MODULE_FILES:
        jf_path = os.path.join(js_dir, jf)
        if os.path.exists(jf_path):
            with open(jf_path, "r", encoding="utf-8") as f:
                raw_js_parts.append(f.read())
        else:
            missing_files.append(jf)

    if missing_files:
        print(f"❌ Error: Faltan módulos JavaScript requeridos: {', '.join(missing_files)}", file=sys.stderr)
        return False

    # Concatenar todos los ficheros JS antes de la compresión para el mejor ratio de diccionario
    concatenated_js = ";\n".join(raw_js_parts)
    raw_js_size = len(concatenated_js.encode("utf-8"))

    # 4. Eliminar comentarios de forma segura
    clean_js = strip_js_comments(concatenated_js)
    clean_js_size = len(clean_js.encode("utf-8"))

    # 5. Comprimir con Gzip level 9 y convertir a Base64
    b64_js, gzip_bytes, b64_bytes = compress_js_to_gzip_base64(clean_js)

    # 6. Limpiar e integrar en HTML
    html_cleaned = re.sub(r'<link[^>]*href=["\']css/styles\.css["\'][^>]*>', '', raw_html)
    html_cleaned = re.sub(r'<script[^>]*src=["\']js/[^"\']+["\'][^>]*></script>', '', html_cleaned)
    html_cleaned = re.sub(r'<!--\s*Estilos visuales[^>]*-->', '', html_cleaned)
    html_cleaned = re.sub(r'<!--\s*Scripts de la aplicación[^>]*-->', '', html_cleaned)

    min_html_base = minify_html(html_cleaned, mode=mode)
    min_html_size = len(min_html_base.encode("utf-8"))

    # Inyección de CSS y JavaScript comprimido
    compressed_script_tag = f'<script type="application/gzip-base64" id="compressed-js">{b64_js}</script>'
    
    final_html = min_html_base.replace("</head>", f"<style>{css_min}</style></head>")
    final_html = final_html.replace("</body>", f"{compressed_script_tag}\n{BOOTSTRAP_LOADER_SCRIPT}</body>")
    final_size = len(final_html.encode("utf-8"))

    # 7. Validación de integridad del distribuible
    is_valid, validation_errors = verify_bundle(final_html, verbose=verbose)
    if not is_valid:
        print("❌ Error de validación en el archivo generado:", file=sys.stderr)
        for err in validation_errors:
            print(f"   - {err}", file=sys.stderr)
        return False

    # 8. Escribir archivo distribuible
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_html)

    elapsed_time = (time.time() - start_time) * 1000
    total_raw_size = raw_html_size + raw_css_size + raw_js_size
    total_reduction_pct = ((total_raw_size - final_size) / total_raw_size) * 100

    # 9. Informe detallado de compresión
    print("\n" + "=" * 70)
    print(f"✨ ZeroChat Standalone Bundle ('{os.path.basename(output_path)}') generado con éxito")
    print("=" * 70)
    print(f"⚙️  Modo: {mode.upper()} | Compresión: Gzip Level 9 (Base64 Stream) | Motor CSS: {css_engine}")
    print(f"⏱️  Tiempo de compilación: {elapsed_time:.1f} ms")
    print("-" * 70)
    print(f"  • HTML Markup:       {raw_html_size:>8,} bytes  ➜  {min_html_size:>8,} bytes  ({(1 - min_html_size/raw_html_size)*100:>5.1f}% reducción)")
    print(f"  • CSS Styles:        {raw_css_size:>8,} bytes  ➜  {min_css_size:>8,} bytes  ({(1 - min_css_size/raw_css_size)*100:>5.1f}% reducción)")
    print(f"  • JS Concatenado:    {raw_js_size:>8,} bytes")
    print(f"  • JS Sin Comentarios:{clean_js_size:>8,} bytes  ({(1 - clean_js_size/raw_js_size)*100:>5.1f}% reducción)")
    print(f"  • JS Gzip (L9):      {gzip_bytes:>8,} bytes  ({(1 - gzip_bytes/clean_js_size)*100:>5.1f}% compresión)")
    print(f"  • JS Base64 Payload: {b64_bytes:>8,} bytes")
    print("-" * 70)
    print(f"📦 TAMAÑO TOTAL RAW:   {total_raw_size:>8,} bytes ({total_raw_size/1024:.1f} KB)")
    print(f"🚀 TAMAÑO DIST FINAL:  {final_size:>8,} bytes ({final_size/1024:.1f} KB)")
    print(f"📊 REDUCCIÓN TOTAL:    {total_reduction_pct:.1f}% ({total_raw_size - final_size:,} bytes ahorrados)")
    print("=" * 70 + "\n")

    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compilador y empaquetador profesional autónomo para ZeroChat con compresión Gzip Base64."
    )
    parser.add_argument(
        "--mode",
        choices=["prod", "dev"],
        default="prod",
        help="Modo de compilación: 'prod' o 'dev'."
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Ruta del archivo de salida (por defecto: 'zerochat.html' en la raíz)."
    )
    parser.add_argument(
        "--fallback-only",
        action="store_true",
        help="Fuerza el uso exclusivo de minificación CSS en Python puro."
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Muestra información detallada de diagnóstico y validación."
    )

    args = parser.parse_args()
    success = build_standalone_html(
        mode=args.mode,
        force_fallback=args.fallback_only,
        verbose=args.verbose,
        output_file=args.output
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
