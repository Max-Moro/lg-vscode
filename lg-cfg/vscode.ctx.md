{% if scope:local AND tag:agent %}
${tpl:agent/index}

---
{% endif %}
${md:README}

---
{% if tag:review %}
# Modified VS Code Extension source code in current branch
{% else %}
# VS Code Extension source code
{% endif %}

${src}

---

${md:media/ui/README, if:TAGSET:vscode-extension:ui-components}

{% if task AND scope:local %}
---

# Current task description

${task}{% endif %}
{% if scope:local AND tag:agent %}
${tpl:agent/footer}
{% endif %}