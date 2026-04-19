/**
 * Reusable Remotion visual primitives library.
 *
 * This string is prepended to every generated Remotion component so the LLM
 * can use pre-built helpers when they fit the visualization. The LLM is free
 * to build custom visuals from scratch when these don't match.
 *
 * All primitives use only the globals already in scope:
 *   React, AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig,
 *   interpolate, spring, Easing
 */
export const REMOTION_PRIMITIVES = `
const _clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' };

function GlassPanel({ children, glow, padding = 32, borderRadius = 16, style = {} }) {
  return React.createElement('div', {
    style: Object.assign({
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: borderRadius,
      padding: padding,
      boxSizing: 'border-box',
    }, style),
  }, children);
}

function SceneEntry({ children, frame, duration = 15 }) {
  var f = typeof frame === 'number' && isFinite(frame) ? frame : 0;
  var d = typeof duration === 'number' && duration > 0 ? duration : 15;
  var opacity = interpolate(f, [0, d], [0, 1], _clamp);
  var scale = interpolate(f, [0, d], [0.92, 1], _clamp);
  return React.createElement('div', {
    style: {
      opacity: opacity,
      transform: 'scale(' + scale + ')',
      transformOrigin: 'center center',
      width: '100%',
      height: '100%',
    },
  }, children);
}

function Stagger({ children, frame, delayPerItem = 10, startDelay = 0 }) {
  return React.Children.map(children, function(child, i) {
    var delay = startDelay + i * delayPerItem;
    var op = interpolate(frame, [delay, delay + 12], [0, 1], _clamp);
    var ty = interpolate(frame, [delay, delay + 12], [20, 0], _clamp);
    return React.createElement('div', {
      key: i,
      style: { opacity: op, transform: 'translateY(' + ty + 'px)' },
    }, child);
  });
}

function TypeWriter({ text, frame, duration, fontSize = 34, color = '#FFFFFF', fontFamily = 'monospace', style = {} }) {
  var t = text || '';
  var d = typeof duration === 'number' && duration > 0 ? duration : 30;
  var charCount = Math.floor(interpolate(frame, [0, d], [0, t.length], _clamp));
  var cursor = Math.sin(frame * 0.15) > 0 ? '|' : '';
  return React.createElement('span', {
    style: Object.assign({
      fontSize: fontSize,
      fontFamily: fontFamily,
      color: color,
      whiteSpace: 'pre-wrap',
    }, style),
  }, t.slice(0, charCount) + cursor);
}

function CodeWindow({ code, title, frame, typingDuration, language, accentColor = '#06B6D4', style = {} }) {
  var c = code || '';
  var dots = React.createElement('div', { style: { display: 'flex', gap: 8, marginBottom: 16 } },
    React.createElement('div', { style: { width: 12, height: 12, borderRadius: '50%', background: '#FF5F57' } }),
    React.createElement('div', { style: { width: 12, height: 12, borderRadius: '50%', background: '#FEBC2E' } }),
    React.createElement('div', { style: { width: 12, height: 12, borderRadius: '50%', background: '#28C840' } })
  );
  var titleBar = title ? React.createElement('div', {
    style: { position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' },
  }, title) : null;
  var td = typeof typingDuration === 'number' && typingDuration > 0 ? typingDuration : 0;
  var charCount = td > 0
    ? Math.floor(interpolate(frame, [0, td], [0, c.length], _clamp))
    : c.length;
  var cursor = td > 0 && charCount < c.length ? (Math.sin(frame * 0.15) > 0 ? '|' : '') : '';
  var displayCode = c.slice(0, charCount) + cursor;
  return React.createElement('div', {
    style: Object.assign({
      background: 'rgba(0,0,0,0.6)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12,
      padding: '16px 20px',
      position: 'relative',
      overflow: 'hidden',
    }, style),
  }, dots, titleBar, React.createElement('pre', {
    style: { margin: 0, fontSize: 30, fontFamily: 'monospace', color: '#E0E0E0', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  }, displayCode));
}
`;

export const REMOTION_PRIMITIVES_PART2 = `
function DataTable({ headers, rows, frame, delayPerRow = 10, startDelay = 0, accentColor = '#06B6D4', style = {} }) {
  var headerRow = React.createElement('div', {
    style: { display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.15)', paddingBottom: 12, marginBottom: 8 },
  }, headers.map(function(h, i) {
    return React.createElement('div', {
      key: i,
      style: { flex: 1, fontSize: 26, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 3 },
    }, h);
  }));
  var dataRows = rows.map(function(row, ri) {
    var delay = startDelay + ri * delayPerRow;
    var rowOp = interpolate(frame, [delay, delay + 12], [0, 1], _clamp);
    return React.createElement('div', {
      key: ri,
      style: {
        display: 'flex',
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        opacity: rowOp,
      },
    },
      row.map(function(cell, ci) {
        return React.createElement('div', {
          key: ci,
          style: { flex: 1, fontSize: 32, color: '#E0E0E0' },
        }, cell);
      })
    );
  });
  return React.createElement('div', { style: style }, headerRow, dataRows);
}

function FlowDiagram({ nodes, frame, startDelay = 0, nodeGap = 10, accentColor = '#06B6D4', direction = 'horizontal', style = {} }) {
  var isHoriz = direction === 'horizontal';
  var items = [];
  nodes.forEach(function(node, i) {
    var nodeDelay = startDelay + i * (nodeGap + 15);
    var nodeScale = interpolate(frame, [nodeDelay, nodeDelay + 12], [0, 1], _clamp);
    var nodeOp = interpolate(frame, [nodeDelay, nodeDelay + 10], [0, 1], _clamp);
    items.push(React.createElement('div', {
      key: 'node-' + i,
      style: {
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        opacity: nodeOp, transform: 'scale(' + nodeScale + ')',
      },
    },
      node.icon ? React.createElement('div', {
        style: { fontSize: 36, width: 56, height: 56, borderRadius: 12, background: accentColor + '20', border: '1px solid ' + accentColor + '40', display: 'flex', alignItems: 'center', justifyContent: 'center', color: accentColor },
      }, node.icon) : null,
      React.createElement('div', { style: { fontSize: 28, fontWeight: 600, color: '#FFFFFF', textAlign: 'center' } }, node.label),
      node.sublabel ? React.createElement('div', { style: { fontSize: 22, color: 'rgba(255,255,255,0.5)', textAlign: 'center' } }, node.sublabel) : null
    ));
    if (i < nodes.length - 1) {
      var arrowDelay = nodeDelay + 12;
      var arrowOp = interpolate(frame, [arrowDelay, arrowDelay + 8], [0, 1], _clamp);
      var arrowW = interpolate(frame, [arrowDelay, arrowDelay + 10], [0, 1], _clamp);
      items.push(React.createElement('div', {
        key: 'arrow-' + i,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: arrowOp, transform: isHoriz ? 'scaleX(' + arrowW + ')' : 'scaleY(' + arrowW + ')',
          color: 'rgba(255,255,255,0.3)', fontSize: 24,
        },
      }, isHoriz ? '→' : '↓'));
    }
  });
  return React.createElement('div', {
    style: Object.assign({
      display: 'flex',
      flexDirection: isHoriz ? 'row' : 'column',
      alignItems: 'center',
      gap: 16,
      justifyContent: 'center',
    }, style),
  }, items);
}

function BarChart({ bars, frame, startDelay = 0, delayPerBar = 8, maxHeight = 200, barWidth = 48, gap = 16, style = {} }) {
  var maxVal = Math.max.apply(null, bars.map(function(b) { return b.value; }));
  return React.createElement('div', {
    style: Object.assign({ display: 'flex', alignItems: 'flex-end', gap: gap, justifyContent: 'center' }, style),
  }, bars.map(function(bar, i) {
    var delay = startDelay + i * delayPerBar;
    var targetH = maxVal > 0 ? (bar.value / maxVal) * maxHeight : 0;
    var h = interpolate(frame, [delay, delay + 20], [0, targetH], _clamp);
    return React.createElement('div', {
      key: i,
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
    },
      React.createElement('div', {
        style: { fontSize: 24, fontWeight: 700, color: bar.color || '#FFFFFF' },
      }, Math.round(interpolate(frame, [delay, delay + 20], [0, bar.value], _clamp))),
      React.createElement('div', {
        style: { width: barWidth, height: h, borderRadius: 6, background: bar.color || '#06B6D4' },
      }),
      React.createElement('div', {
        style: { fontSize: 20, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 4 },
      }, bar.label)
    );
  }));
}

function CountUp({ target, frame, duration = 30, fontSize = 64, color = '#FFFFFF', prefix = '', suffix = '', decimals = 0, style = {} }) {
  var t = typeof target === 'number' && isFinite(target) ? target : 0;
  var d = typeof duration === 'number' && duration > 0 ? duration : 30;
  var val = interpolate(frame, [0, d], [0, t], _clamp);
  var display = decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString();
  return React.createElement('span', {
    style: Object.assign({ fontSize: fontSize, fontWeight: 800, color: color, fontVariantNumeric: 'tabular-nums' }, style),
  }, prefix + display + suffix);
}

function Badge({ label, color = '#06B6D4', fontSize = 26, style = {} }) {
  return React.createElement('span', {
    style: Object.assign({
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 14px', borderRadius: 8,
      background: color + '25', border: '1px solid ' + color + '60',
      color: color, fontSize: fontSize, fontWeight: 600,
    }, style),
  }, label);
}

function IconBox({ icon, size = 56, color = '#06B6D4', style = {} }) {
  return React.createElement('div', {
    style: Object.assign({
      width: size, height: size, borderRadius: 12,
      background: color + '18', border: '1px solid ' + color + '35',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.5, color: color,
    }, style),
  }, icon);
}

function DrawBorder({ width, height, frame, duration = 30, color = '#06B6D4', strokeWidth = 2, borderRadius = 16, style = {} }) {
  var w = typeof width === 'number' ? width : 400;
  var h = typeof height === 'number' ? height : 200;
  var perim = 2 * (w + h);
  var offset = interpolate(frame, [0, duration], [perim, 0], _clamp);
  return React.createElement('svg', {
    width: w, height: h,
    style: Object.assign({ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }, style),
  }, React.createElement('rect', {
    x: strokeWidth / 2, y: strokeWidth / 2,
    width: w - strokeWidth, height: h - strokeWidth,
    rx: borderRadius, ry: borderRadius,
    fill: 'none', stroke: color, strokeWidth: strokeWidth,
    strokeDasharray: perim, strokeDashoffset: offset,
  }));
}
`;

export const FULL_PRIMITIVES = REMOTION_PRIMITIVES + REMOTION_PRIMITIVES_PART2;
