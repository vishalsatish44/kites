// Lightweight inline SVG charts — no external chart lib needed.

export function MiniBarChart({ data = [], labels = [], color = '#70C041', height = 160 }) {
  const max = Math.max(...data, 1);
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((v, i) => (
        <div key={i} className="bar-col" title={`${labels[i] || ''}: ${v}`}>
          <div className="bar-bar" style={{
            height: `${(v / max) * 100}%`,
            background: color,
            opacity: v ? 1 : 0.15,
          }} />
          <div className="bar-label">{labels[i] || ''}</div>
        </div>
      ))}
    </div>
  );
}

export function GaugeChart({ value = 0, max = 100, color = '#008080', isDarkMode = false }) {
  const totalSegments = 12;
  const ratio = Math.max(0, Math.min(1, value / max));
  const activeSegments = Math.round(totalSegments * ratio);
  const radius = 80;
  const cx = 100;
  const cy = 110;

  const polarToCartesian = (centerX, centerY, r, angleInDegrees) => {
    const rad = (angleInDegrees - 180) * Math.PI / 180;
    return { x: centerX + r * Math.cos(rad), y: centerY + r * Math.sin(rad) };
  };
  const arc = (start, end) => {
    const s = polarToCartesian(cx, cy, radius, end);
    const e = polarToCartesian(cx, cy, radius, start);
    const large = end - start <= 180 ? '0' : '1';
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 0 ${e.x} ${e.y}`;
  };

  const paths = [];
  for (let i = 0; i < totalSegments; i++) {
    const sa = 180 + (i * 180 / totalSegments);
    const ea = 180 + ((i + 1) * 180 / totalSegments) - 2;
    paths.push(
      <path key={i} d={arc(sa, ea)} fill="none"
        stroke={i < activeSegments ? color : (isDarkMode ? '#374151' : '#E5E7EB')}
        strokeWidth="12" strokeLinecap="round" />
    );
  }

  return (
    <svg viewBox="0 0 200 130" style={{ width: '100%', maxWidth: 240 }}>
      {paths}
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="22" fontWeight="700"
        fill={isDarkMode ? '#fff' : '#111'}>
        {Math.round(ratio * 100)}%
      </text>
    </svg>
  );
}

export function Sparkline({ data = [], width = 120, height = 40, color = '#70C041' }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}
