#!/usr/bin/env python3
"""
Script de compilación y empaquetado automático para ChatCLI.
Genera el archivo único autónomo 'chatcli.html' con todo el CSS y los módulos JS
embebidos en variables Base64 con decodificación UTF-8 segura.
"""

import base64
import re
import os
import sys

def build_standalone_html():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    index_path = os.path.join(base_dir, "index.html")
    css_path = os.path.join(base_dir, "css", "styles.css")
    js_dir = os.path.join(base_dir, "js")
    output_path = os.path.join(base_dir, "chatcli.html")

    if not os.path.exists(index_path):
        print(f"Error: No se encontró {index_path}", file=sys.stderr)
        return False

    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()

    css_content = ""
    if os.path.exists(css_path):
        with open(css_path, "r", encoding="utf-8") as f:
            css_content = f.read()

    js_files = ["cookies.js", "i18n.js", "sandbox.js", "web-browser.js", "web-search.js", "markdown.js", "api.js", "file-parser.js", "app.js"]
    js_encoded = {}

    for jf in js_files:
        jf_path = os.path.join(js_dir, jf)
        if os.path.exists(jf_path):
            with open(jf_path, "r", encoding="utf-8") as f:
                js_encoded[jf] = base64.b64encode(f.read().encode("utf-8")).decode("ascii")
        else:
            print(f"Aviso: Archivo no encontrado {jf_path}", file=sys.stderr)

    css_b64 = base64.b64encode(css_content.encode("utf-8")).decode("ascii")

    # Limpiar referencias externas de CSS y JS del HTML base
    html_clean = re.sub(r'<link[^>]*href=["\']css/styles\.css["\'][^>]*>', '', html)
    html_clean = re.sub(r'<script[^>]*src=["\']js/[^"\']+["\'][^>]*></script>', '', html_clean)
    html_clean = re.sub(r'<!--\s*Estilos visuales[^>]*-->', '', html_clean)
    html_clean = re.sub(r'<!--\s*Scripts de la aplicación[^>]*-->', '', html_clean)

    # Construir bloque de módulos JS
    modules_json_entries = []
    for name in js_files:
        if name in js_encoded:
            modules_json_entries.append(f'        {{ name: "{name}", b64: "{js_encoded[name]}" }}')

    modules_block = ",\n".join(modules_json_entries)

    # Script autocontenido
    loader_script = f"""  <!-- Inyección y Ejecución de Recursos Autónomos desde Base64 -->
  <script>
    (function() {{
      "use strict";

      // Decodificación UTF-8 segura para Base64
      function decodeB64Utf8(str) {{
        return decodeURIComponent(escape(atob(str)));
      }}

      // 1. Inyección de estilos CSS embebidos
      const CSS_BASE64 = "{css_b64}";
      try {{
        const styleTag = document.createElement("style");
        styleTag.textContent = decodeB64Utf8(CSS_BASE64);
        document.head.appendChild(styleTag);
      }} catch (cssErr) {{
        console.error("Error al inyectar CSS en Base64:", cssErr);
      }}

      // 2. Módulos JavaScript empaquetados en Base64
      const MODULES = [
{modules_block}
      ];

      // 3. Ejecución secuencial de los módulos en el entorno global
      MODULES.forEach(function(mod) {{
        try {{
          const code = decodeB64Utf8(mod.b64);
          const scriptEl = document.createElement("script");
          scriptEl.type = "text/javascript";
          scriptEl.text = code + "\\n//# sourceURL=bundled://" + mod.name;
          document.body.appendChild(scriptEl);
        }} catch (jsErr) {{
          console.error("Error al ejecutar módulo autónomo (" + mod.name + "):", jsErr);
        }}
      }});
    }})();
  </script>"""

    final_html = html_clean.replace("</body>", loader_script + "\n</body>")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(final_html)

    print(f"✨ Compilado autónomo 'chatcli.html' actualizado con éxito ({os.path.getsize(output_path):,} bytes).")
    return True

if __name__ == "__main__":
    build_standalone_html()
