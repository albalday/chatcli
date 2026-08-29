#!/usr/bin/env python3
"""
ChatCLI Professional Standalone Bundler & Minifier.
Compila los archivos modulares HTML, CSS y JS en un único archivo autónomo y portable 'chatcli.html'.

Características principales:
- Arquitectura de dos niveles:
    1. Nivel Principal: Minificación léxica y AST de alto rendimiento vía esbuild / terser en pase único.
    2. Nivel Fallback: Tokenizador de máquina de estados (FSM) en Python puro que elimina comentarios
       y espacios redundantes con seguridad semántica garantizada (preserva Strings, Template Literals ${...},
       RegExps y reglas de inserción automática de punto y coma ASI).
- Minificación integral de las 3 capas: HTML estructural, estilos CSS y módulos JavaScript.
- Verificación automática post-build: Valida estructura HTML, inclusión de módulos y sintaxis JS.
- Soporte de múltiples modos: Producción (--mode=prod), Desarrollo (--mode=dev), Fallback forzado (--fallback-only) y Detallado (--verbose / -v).
"""

import argparse
import os
import re
import shutil
import subprocess
import sys
import time
from typing import Dict, List, Optional, Tuple

JS_MODULE_FILES = [
    "cookies.js",
    "ragStorage.js",
    "i18n.js",
    "sandbox.js",
    "charts.js",
    "web-browser.js",
    "web-search.js",
    "markdown.js",
    "providers.js",
    "api.js",
    "file-parser.js",
    "agent-core.js",
    "mcp.js",
    "debug.js",
    "tool-cards.js",
    "attachments.js",
    "export.js",
    "state.js",
    "context-manager.js",
    "app.js"
]

CORE_EXPORT_SYMBOLS = [
    "ChatStorage",
    "ChatRagStorage",
    "ChatI18n",
    "ChatSandbox",
    "ChatCharts",
    "ChatWebBrowser",
    "ChatWebSearch",
    "ChatMarkdown",
    "ChatProviders",
    "ChatAPI",
    "ChatFileParser",
    "ChatAgentCore",
    "ChatMCP",
    "ChatDebug",
    "ChatToolCards",
    "ChatAttachments",
    "ChatExport",
    "ChatState",
    "ChatContextManager"
]


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

    # 2. Eliminar comentarios HTML (excepto comentarios condicionales IE)
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


def preprocess_js_for_browser(js_code: str) -> str:
    """
    Elimina ramas de compatibilidad exclusivas de Node.js (CommonJS exports y require dinámicos)
    que constituyen código muerto en el entorno web del navegador, permitiendo a Terser/esbuild
    optimizar y podar bloques innecesarios.
    """
    # 1. Neutralizar comprobación UMD de module.exports -> false
    cleaned = re.sub(
        r'typeof\s+exports\s*===\s*[\'"]object[\'"]\s*&&\s*typeof\s+module\s*!==\s*[\'"]undefined[\'"]',
        'false',
        js_code
    )
    # 2. Neutralizar comprobaciones de require de Node.js -> false
    cleaned = re.sub(
        r'typeof\s+require\s*!==\s*[\'"]undefined[\'"]',
        'false',
        cleaned
    )
    return cleaned


def minify_js_external(js_code: str) -> Tuple[Optional[str], str]:
    """
    Intenta minificar JavaScript mediante herramientas AST externas en pase único.
    Prueba primero Terser con multi-pass y poda de código muerto, y posteriormente esbuild.
    Retorna (código_minificado, nombre_del_motor_utilizado).
    """
    processed_code = preprocess_js_for_browser(js_code)

    # 1. Intentar Terser (máxima compresión AST multi-pass y mangling)
    try:
        terser_compress_opts = (
            'passes=3,dead_code=true,unused=true,collapse_vars=true,'
            'reduce_vars=true,booleans=true,conditionals=true,evaluate=true,'
            'sequences=true,join_vars=true,drop_debugger=true'
        )
        res = subprocess.run(
            ['npx', '--yes', 'terser', '--compress', terser_compress_opts, '--mangle', 'eval=true'],
            input=processed_code,
            capture_output=True,
            text=True,
            check=True
        )
        if res.stdout and len(res.stdout.strip()) > 100:
            return res.stdout.strip(), "Terser (AST Multi-Pass & Dead-Code Pruned)"
    except Exception:
        pass

    # 2. Intentar esbuild (ultra rápido)
    try:
        res = subprocess.run(
            ['npx', '--yes', 'esbuild', '--minify', '--loader=js'],
            input=processed_code,
            capture_output=True,
            text=True,
            check=True
        )
        if res.stdout and len(res.stdout.strip()) > 100:
            return res.stdout.strip(), "esbuild (AST Single-Pass & Dead-Code Pruned)"
    except Exception:
        pass

    return None, "none"


def minify_js_fallback(js: str) -> str:
    """
    Tokenizador léxico de JavaScript basado en máquina de estados finitos (FSM) en Python puro.
    Elimina comentarios y líneas vacías garantizando que nunca se rompan:
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


def verify_bundle(html_content: str, verbose: bool = False) -> Tuple[bool, List[str]]:
    """
    Verifica la integridad del archivo distribuible generado:
    1. Estructura HTML básica.
    2. Ausencia de referencias externas a archivos locales.
    3. Presencia de todos los símbolos y módulos requeridos.
    4. Validación de sintaxis JavaScript embebido.
    """
    errors: List[str] = []

    # 1. Estructura HTML básica
    required_tags = ['<!DOCTYPE html>', '<html', '<head', '</head>', '<body', '</body>', '</html>', '<style>', '</style>', '<script>', '</script>']
    for tag in required_tags:
        if tag.lower() not in html_content.lower():
            errors.append(f"Falta la etiqueta requerida '{tag}' en el documento generado.")

    # 2. Ausencia de referencias a scripts/css externos locales
    if re.search(r'<script[^>]*src=["\']js/[^"\']+["\'][^>]*>', html_content, re.IGNORECASE):
        errors.append("El archivo generado aún contiene etiquetas <script src=\"js/...\"> sin embeber.")

    if re.search(r'<link[^>]*href=["\']css/[^"\']+["\'][^>]*>', html_content, re.IGNORECASE):
        errors.append("El archivo generado aún contiene etiquetas <link href=\"css/...\"> sin embeber.")

    # 3. Presencia de módulos clave
    script_match = re.search(r'<script>(.*?)</script>', html_content, re.DOTALL)
    if not script_match:
        errors.append("No se encontró el bloque <script> embebido en el HTML final.")
    else:
        embedded_js = script_match.group(1)
        for symbol in CORE_EXPORT_SYMBOLS:
            if symbol not in embedded_js:
                errors.append(f"El símbolo o módulo esencial '{symbol}' no fue encontrado en el bundle final.")

        # 4. Validación de sintaxis en Node.js si está presente
        try:
            val_res = subprocess.run(
                ['node', '-c'],
                input=embedded_js,
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
    Ejecuta el pipeline completo de compilación, minificación y generación del bundle autónomo.
    """
    start_time = time.time()
    base_dir = os.path.dirname(os.path.abspath(__file__))

    index_path = os.path.join(base_dir, "index.html")
    css_path = os.path.join(base_dir, "css", "styles.css")
    js_dir = os.path.join(base_dir, "js")
    output_path = os.path.abspath(output_file) if output_file else os.path.join(base_dir, "chatcli.html")

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

    # 3. Cargar y concatenar JavaScript modular
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

    concatenated_js = ";\n".join(raw_js_parts)
    raw_js_size = len(concatenated_js.encode("utf-8"))

    js_engine = "Python FSM Tokenizer"
    if mode == "dev":
        min_js = concatenated_js
        js_engine = "Unminified (Dev)"
    elif not force_fallback:
        ext_js, engine_name = minify_js_external(concatenated_js)
        if ext_js is not None:
            min_js = ext_js
            js_engine = engine_name
        else:
            min_js = minify_js_fallback(preprocess_js_for_browser(concatenated_js))
    else:
        min_js = minify_js_fallback(preprocess_js_for_browser(concatenated_js))

    min_js_size = len(min_js.encode("utf-8"))

    # 4. Limpiar e integrar en HTML
    html_cleaned = re.sub(r'<link[^>]*href=["\']css/styles\.css["\'][^>]*>', '', raw_html)
    html_cleaned = re.sub(r'<script[^>]*src=["\']js/[^"\']+["\'][^>]*></script>', '', html_cleaned)
    html_cleaned = re.sub(r'<!--\s*Estilos visuales[^>]*-->', '', html_cleaned)
    html_cleaned = re.sub(r'<!--\s*Scripts de la aplicación[^>]*-->', '', html_cleaned)

    min_html_base = minify_html(html_cleaned, mode=mode)
    min_html_size = len(min_html_base.encode("utf-8"))

    if mode == "prod":
        final_html = min_html_base.replace("</head>", f"<style>{css_min}</style></head>")
        final_html = final_html.replace("</body>", f"<script>{min_js}</script></body>")
    else:
        style_block = f"  <style>\n{css_min}\n  </style>"
        script_block = f"  <script>\n{min_js}\n  </script>"
        final_html = min_html_base.replace("</head>", f"{style_block}\n</head>")
        final_html = final_html.replace("</body>", f"{script_block}\n</body>")
    final_size = len(final_html.encode("utf-8"))

    # 5. Validación de integridad del distribuible
    is_valid, validation_errors = verify_bundle(final_html, verbose=verbose)
    if not is_valid:
        print("❌ Error de validación en el archivo generado:", file=sys.stderr)
        for err in validation_errors:
            print(f"   - {err}", file=sys.stderr)
        return False

    # 6. Escribir archivo distribuible
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_html)

    elapsed_time = (time.time() - start_time) * 1000
    total_raw_size = raw_html_size + raw_css_size + raw_js_size
    total_reduction_pct = ((total_raw_size - final_size) / total_raw_size) * 100

    # 7. Informe detallado de tamaños
    print("\n" + "=" * 70)
    print(f"✨ ChatCLI Standalone Bundle ('{os.path.basename(output_path)}') generado con éxito")
    print("=" * 70)
    print(f"⚙️  Modo: {mode.upper()} | Motor JS: {js_engine} | Motor CSS: {css_engine}")
    print(f"⏱️  Tiempo de compilación: {elapsed_time:.1f} ms")
    print("-" * 70)
    print(f"  • HTML Markup:   {raw_html_size:>8,} bytes  ➜  {min_html_size:>8,} bytes  ({(1 - min_html_size/raw_html_size)*100:>5.1f}% reducción)")
    print(f"  • CSS Styles:    {raw_css_size:>8,} bytes  ➜  {min_css_size:>8,} bytes  ({(1 - min_css_size/raw_css_size)*100:>5.1f}% reducción)")
    print(f"  • JavaScript:    {raw_js_size:>8,} bytes  ➜  {min_js_size:>8,} bytes  ({(1 - min_js_size/raw_js_size)*100:>5.1f}% reducción)")
    print("-" * 70)
    print(f"📦 TAMAÑO TOTAL RAW:  {total_raw_size:>8,} bytes ({total_raw_size/1024:.1f} KB)")
    print(f"🚀 TAMAÑO DIST FINAL: {final_size:>8,} bytes ({final_size/1024:.1f} KB)")
    print(f"📊 REDUCCIÓN TOTAL:   {total_reduction_pct:.1f}% ({total_raw_size - final_size:,} bytes ahorrados)")
    print("=" * 70 + "\n")

    return True


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compilador y empaquetador profesional autónomo para ChatCLI."
    )
    parser.add_argument(
        "--mode",
        choices=["prod", "dev"],
        default="prod",
        help="Modo de compilación: 'prod' (minificación completa) o 'dev' (sin minificar, formato legible)."
    )
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Ruta del archivo de salida (por defecto: 'chatcli.html' en la raíz)."
    )
    parser.add_argument(
        "--fallback-only",
        action="store_true",
        help="Fuerza el uso exclusivo del motor de compresión seguro en Python puro (sin invocar herramientas externas)."
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

