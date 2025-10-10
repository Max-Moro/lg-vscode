# ${md:README}

---

# ${md:media/ui/README}

---

# Исходный код VS Code Extension

${src}
{% if task %}
# Описание текущей задачи

## ${md@self:new-send-to-ai}

## Дополнительные детали

${task}{% endif %}