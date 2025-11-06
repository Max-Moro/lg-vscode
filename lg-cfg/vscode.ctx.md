{% if scope:local AND tag:agent %}
${tpl:agent/index}

---
{% endif %}
${md:README}

---
{% if tag:review %}
# Измененный исходный код VS Code Extension в текущей ветке
{% else %}
# Исходный код VS Code Extension
{% endif %}

${src}

---

${md:media/ui/README, if:TAGSET:vscode-extension:ui-components}

{% if task AND scope:local %}
---

# Описание текущей задачи

${task}{% endif %}
{% if scope:local AND tag:agent %}
${tpl:agent/footer}
{% endif %}