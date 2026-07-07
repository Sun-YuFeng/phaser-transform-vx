// Minimal DOMParser polyfill for WeChat mini game (Phaser bitmap font XML)
function createElement(tagName, attrs) {
  const el = {
    tagName: tagName,
    attributes: attrs || {},
    childNodes: [],
    parentNode: null,
    getAttribute(name) {
      return this.attributes[name] != null ? String(this.attributes[name]) : null
    },
    removeChild(child) {
      const i = this.childNodes.indexOf(child)
      if (i >= 0) this.childNodes.splice(i, 1)
      child.parentNode = null
      return child
    },
  }
  return el
}

function parseAttrs(str) {
  const attrs = {}
  const re = /([\w:-]+)="([^"]*)"/g
  let m
  while ((m = re.exec(str))) attrs[m[1]] = m[2]
  return attrs
}

function parseXML(xml) {
  const root = createElement('root', {})
  const stack = [root]
  const tagRe = /<(\/?)([\w:-]+)([^>]*?)(\/?)>/g
  let m
  let lastIndex = 0

  while ((m = tagRe.exec(xml))) {
    const closing = m[1] === '/'
    const tag = m[2]
    const attrs = parseAttrs(m[3] || '')
    const selfClose = m[4] === '/'

    if (closing) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const node = createElement(tag, attrs)
    const parent = stack[stack.length - 1]
    parent.childNodes.push(node)
    node.parentNode = parent
    if (!selfClose) stack.push(node)
    lastIndex = tagRe.lastIndex
  }

  const doc = {
    documentElement: root.childNodes[0] || root,
    getElementsByTagName(tagName) {
      const out = []
      const walk = (node) => {
        if (!node || !node.tagName) return
        if (node.tagName === tagName) out.push(node)
        if (node.childNodes) node.childNodes.forEach(walk)
      }
      walk(this.documentElement)
      return out
    },
  }
  return doc
}

class DOMParserPolyfill {
  parseFromString(str) {
    return parseXML(str)
  }
}

if (typeof window !== 'undefined' && !window.DOMParser) {
  window.DOMParser = DOMParserPolyfill
}
