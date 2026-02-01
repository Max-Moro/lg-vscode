{% if scope:local %}{% if tag:agent %}
${tpl:/agent/index}

---
{% endif %}
${md:../cli/README}

---
{% endif %}
${md:README}

---
{% if tag:review %}
# Modified VS Code Extension source code in current branch

${review}

{% else %}
# VS Code Extension source code

${src}

{% endif %}{% if NOT tag:review %}
---

${md:media/ui/README, if:TAGSET:vscode-extension:ui-components}

{% endif %}
---

${md@self:/control-panel-state-architecture}
{% if task AND scope:local %}
---

# Current task description

${task}{% endif %}
{% if scope:local AND tag:agent %}
${tpl:agent/footer}
{% endif %}