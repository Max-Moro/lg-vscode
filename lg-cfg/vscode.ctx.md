${md:README}

---

${md:media/ui/README, if:TAGSET:vscode-extension:ui-components}

---
{% if tag:review %}
# Измененный исходный код VS Code Extension в текущей ветке
{% else %}
# Исходный код VS Code Extension
{% endif %}

${src}
{% if task AND scope:local %}
---

# Описание текущей задачи

${task}{% endif %}