import { useMemo, useRef, useState } from 'react'
import { fencingActions } from './simple_actions.js'

const LEVEL_NAMES = ['A', 'B', 'B', 'A']

function makeVideoPath(text, level) {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${import.meta.env.BASE_URL}videos/level-${level}-${slug}.mp4`
}

function buildForest(rows) {
  const roots = []
  let nextId = 1

  for (const row of rows) {
    const sequence = row.responses
      .map((text, level) => ({
        text,
        level,
      }))
      .filter(({ text }) => text)

    if (sequence.length === 0) continue

    const rootAction = sequence[0]

    let root = roots.find((candidate) => candidate.text === rootAction.text)

    if (!root) {
      root = {
        id: `node-${nextId++}`,
        text: rootAction.text,
        level: rootAction.level,
        children: [],
        sources: [],
        terminal: false,
        video: makeVideoPath(rootAction.text, rootAction.level),
      }

      roots.push(root)
    }

    let current = root

    for (let i = 1; i < sequence.length; i += 1) {
      const item = sequence[i]

      let child = current.children.find(
        (candidate) =>
          candidate.text === item.text && candidate.level === item.level,
      )

      if (!child) {
        child = {
          id: `node-${nextId++}`,
          text: item.text,
          level: item.level,
          children: [],
          sources: [],
          terminal: false,
          video: makeVideoPath(item.text, item.level),
        }

        current.children.push(child)
      }

      current = child
    }

    if (!current.sources.includes(row.source)) {
      current.sources.push(row.source)
    }

    current.terminal = true
  }

  return roots
}

function getTreeHeight(node) {
  if (!node.children.length) {
    return 1
  }

  return node.children.reduce((total, child) => total + getTreeHeight(child), 0)
}

function flattenTree(root) {
  const nodes = []
  const edges = []

  const NODE_WIDTH = 210
  const NODE_HEIGHT = 82
  const HORIZONTAL_GAP = 130
  const VERTICAL_GAP = 34

  function visit(node, depth, top) {
    const height = getTreeHeight(node)

    const nodeHeight = Math.max(
      height * (NODE_HEIGHT + VERTICAL_GAP),
      NODE_HEIGHT,
    )

    const centerY = top + nodeHeight / 2

    const x = depth * (NODE_WIDTH + HORIZONTAL_GAP)

    const y = centerY - NODE_HEIGHT / 2

    nodes.push({
      ...node,
      x,
      y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    })

    let childTop =
      centerY - (height * (NODE_HEIGHT + VERTICAL_GAP) - VERTICAL_GAP) / 2

    for (const child of node.children) {
      const childHeight = getTreeHeight(child)

      visit(child, depth + 1, childTop)

      const placedChild = nodes.find((item) => item.id === child.id)

      edges.push({
        id: `${node.id}-${child.id}`,
        from: node.id,
        to: child.id,
        x1: x + NODE_WIDTH,
        y1: centerY,
        x2: placedChild.x,
        y2: placedChild.y + placedChild.height / 2,
      })

      childTop += childHeight * (NODE_HEIGHT + VERTICAL_GAP)
    }

    return nodeHeight
  }

  visit(root, 0, 0)

  return {
    nodes,
    edges,
  }
}

function Tree({ root, onSelect, selectedId }) {
  const { nodes, edges } = useMemo(() => flattenTree(root), [root])

  const width = Math.max(...nodes.map((node) => node.x + node.width), 1000) + 80

  const height =
    Math.max(...nodes.map((node) => node.y + node.height), 400) + 80

  return (
    <div className="forest-tree">
      <div className="tree-title">
        <span className="tree-title-line" />

        <h2>{root.text}</h2>

        <span className="tree-title-line" />
      </div>

      <div
        className="diagram"
        style={{
          width,
          height,
        }}
      >
        <svg
          className="connections"
          width={width}
          height={height}
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={`branch-${root.id}`} x1="0%" x2="100%">
              <stop offset="0%" stopColor="#9c7b43" stopOpacity="0.32" />

              <stop offset="50%" stopColor="#d6b36a" stopOpacity="0.65" />

              <stop offset="100%" stopColor="#d6b36a" stopOpacity="0.3" />
            </linearGradient>
          </defs>

          {edges.map((edge) => {
            const midpoint = edge.x1 + (edge.x2 - edge.x1) / 2

            return (
              <g key={edge.id}>
                <path
                  d={`
                M ${edge.x1} ${edge.y1}
                H ${midpoint}
                V ${edge.y2}
                H ${edge.x2}
              `}
                  fill="none"
                  stroke={`url(#branch-${root.id})`}
                  strokeWidth="2"
                />

                <circle
                  cx={edge.x1}
                  cy={edge.y1}
                  r="3"
                  fill="#d6b36a"
                  opacity="0.7"
                />

                <circle
                  cx={edge.x2}
                  cy={edge.y2}
                  r="3"
                  fill="#d6b36a"
                  opacity="0.7"
                />
              </g>
            )
          })}
        </svg>

        {nodes.map((node) => {
          const selected = selectedId === node.id

          return (
            <button
              key={node.id}
              type="button"
              className={[
                'diagram-node',
                `node-level-${node.level}`,
                selected ? 'selected' : '',
                node.terminal ? 'terminal' : '',
              ].join(' ')}
              style={{
                left: node.x,
                top: node.y,
                width: node.width,
                height: node.height,
              }}
              onClick={() => onSelect(node)}
            >
              <span className="node-letter">{LEVEL_NAMES[node.level]}</span>

              <span className="diagram-node-text">{node.text}</span>

              {node.terminal && <span className="terminal-dot" />}

              <div className="hover-card">
                <span className="hover-level">{LEVEL_NAMES[node.level]}</span>

                <strong>{node.text}</strong>

                {node.terminal && node.sources.length > 0 && (
                  <span className="hover-source">
                    Source: {node.sources.join(', ')}
                  </span>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}


function SimpleActions() {
  const forest = useMemo(() => buildForest(fencingActions), [])

  const [selectedNode, setSelectedNode] = useState(null)
  const [panelWidth, setPanelWidth] = useState(390)

  const resizingPanel = useRef(false)

  function startPanelResize(event) {
    event.preventDefault()
    event.stopPropagation()

    resizingPanel.current = true

    event.currentTarget.setPointerCapture(event.pointerId)

    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }

  function handlePanelResize(event) {
    if (!resizingPanel.current) return

    const newWidth = window.innerWidth - event.clientX

    const clampedWidth = Math.min(800, Math.max(300, newWidth))

    setPanelWidth(clampedWidth)
  }

  function stopPanelResize(event) {
    resizingPanel.current = false

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  function handleNodeSelect(node) {
    if (selectedNode?.id === node.id) {
      setSelectedNode(null)
    } else {
      setSelectedNode(node)
    }
  }


  
  const [offset, setOffset] = useState({
    x: 40,
    y: 30,
  })

  const dragging = useRef(false)

  const dragStart = useRef({
    x: 0,
    y: 0,
  })

  const [zoom, setZoom] = useState(0.72)

  function handleWheel(event) {
    event.preventDefault()

    const delta = event.deltaY > 0 ? -0.06 : 0.06

    setZoom((current) =>
      Math.min(1.25, Math.max(0.35, current + delta)),
    )
}


  function pointerDown(event) {
    if (event.target.closest('.diagram-node')) {
      return
    }

    dragging.current = true

    dragStart.current = {
      x: event.clientX - offset.x,
      y: event.clientY - offset.y,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function pointerMove(event) {
    if (!dragging.current) return

    setOffset({
      x: event.clientX - dragStart.current.x,

      y: event.clientY - dragStart.current.y,
    })
  }

  function pointerUp() {
    dragging.current = false
  }

  return (
    <div className="app">
      <header className="site-header">
        <div>
          <p className="eyebrow">Gaming Gamers</p>

          <h1>Simple Actions</h1>

          <p className="subtitle">
            A visual map of fencing exchanges, following each A / B / B / A
            response.
          </p>
        </div>

        <div className="header-stat">
          <strong>{forest.length}</strong>
          <span>opening actions</span>
        </div>
      </header>

      <section className="legend">
        <div className="legend-help">
          Hover for movement details · Click to pin · Drag to pan · Scroll to
          zoom
        </div>
      </section>

      <main
        onWheel={handleWheel}
        className="tree-viewport"
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
      >
            <div
              className="tree-stage"
              style={{
                transform: `
                  translate(${offset.x}px, ${offset.y}px)
                  scale(${zoom})
                `,
              }}
            >
          {forest.map((root) => (
            <Tree
              key={root.id}
              root={root}
              onSelect={handleNodeSelect}
              selectedId={selectedNode?.id}
            />
          ))}
        </div>
      </main>

      <aside
        className={`info-panel ${selectedNode ? 'open' : ''}`}
        style={{
          width: `${panelWidth}px`,
        }}
      >
        <div
          className="panel-resize-handle"
          onPointerDown={startPanelResize}
          onPointerMove={handlePanelResize}
          onPointerUp={stopPanelResize}
          onPointerCancel={stopPanelResize}
          role="separator"
          aria-label="Resize sidebar"
        />

        <button
          className="close-panel"
          type="button"
          onClick={() => setSelectedNode(null)}
          aria-label="Close details"
        >
          ×
        </button>

        {selectedNode ? (
          <>
            <p className="panel-kicker">
              {LEVEL_NAMES[selectedNode.level]} RESPONSE
            </p>

            <h2>{selectedNode.text}</h2>

            {selectedNode.terminal && selectedNode.sources.length > 0 && (
              <div className="source-display">
                <span>Source</span>

                <strong>{selectedNode.sources.join(', ')}</strong>
              </div>
            )}

            <div className="panel-video">
              <video
                key={selectedNode.video}
                className="movement-video"
                controls
                playsInline
                preload="metadata"
              >
                <source src={selectedNode.video} type="video/mp4" />
                Your browser does not support HTML5 video.
              </video>
            </div>
          </>
        ) : (
          <>
            <p className="panel-kicker">RESPONSE TREE</p>

            <h2>Select a movement</h2>

            <p className="panel-description">
              Hover over any movement to preview its details. Click it to open
              its video and movement information.
            </p>
          </>
        )}
      </aside>
    </div>
  )
}

export default SimpleActions
