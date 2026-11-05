"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";

// Small hand-written SVG charts: the dashboard needs two forms, and a chart
// library would outweigh all of our own code. Marks follow one spec: 2px lines,
// 8px end dots with a surface ring, thin columns, one axis, hairline grid. Every
// chart sits beside a table view, so a tooltip never hides a value.

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function Tooltip({ x, width, children }: { x: number; width: number; children: React.ReactNode }) {
  const onRight = x < width / 2;
  return (
    <div
      className="pointer-events-none absolute top-1 z-20 rounded-xl border border-line/80 bg-canvas/95 px-3.5 py-2.5 text-xs shadow-lg backdrop-blur-sm"
      style={onRight ? { left: x + 12 } : { right: width - x + 12 }}
    >
      {children}
    </div>
  );
}

export type LineSeries = { id: string; name: string; color: string; values: (number | null)[] };

const M = { top: 12, right: 12, bottom: 26, left: 40 };

export function LineChart({
  labels,
  series,
  height = 240,
  yMax,
  reference,
  format,
  label,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  yMax: number;
  /** A level the reader should compare against, labelled on the chart. */
  reference?: { value: number; label: string };
  format: (v: number) => string;
  label: string;
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const innerW = Math.max(width - M.left - M.right, 10);
  const innerH = height - M.top - M.bottom;
  const x = (i: number) => M.left + (labels.length > 1 ? (i / (labels.length - 1)) * innerW : 0);
  const y = (v: number) => M.top + innerH - (v / yMax) * innerH;
  const ticks = [0, yMax / 2, yMax];
  const everyX = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(innerW / 70))));

  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const areaPath = (values: (number | null)[]) => {
    const linePart = path(values);
    if (!linePart) return "";
    const firstIndex = values.findIndex((v) => v !== null);
    const lastIndex = values.findLastIndex((v) => v !== null);
    if (firstIndex === -1 || lastIndex === -1) return "";
    return `${linePart}L${x(lastIndex).toFixed(1)} ${y(0).toFixed(1)}L${x(firstIndex).toFixed(1)} ${y(0).toFixed(1)}Z`;
  };

  function onMove(e: PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect();
    const position = (e.clientX - box.left - M.left) / innerW;
    setActive(Math.round(Math.min(Math.max(position, 0), 1) * (labels.length - 1)));
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((i) => {
      const from = i ?? labels.length - 1;
      return Math.min(Math.max(from + (e.key === "ArrowRight" ? 1 : -1), 0), labels.length - 1);
    });
  }

  return (
    <div ref={ref} className="relative">
      <svg
        role="img"
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys walk the chart
        tabIndex={0}
        width={width}
        height={height}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        className="block touch-pan-y"
      >
        <defs>
          <linearGradient id="rollGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-series-1)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--color-series-1)" stopOpacity="0.0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + innerW} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text
              x={M.left - 8}
              y={y(t) + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--color-muted)"
              className="num font-medium"
            >
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map(
          (l, i) =>
            i % everyX === 0 && (
              <text
                key={l}
                x={x(i)}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
                className="font-medium"
              >
                {l}
              </text>
            ),
        )}
        {reference && (
          <g>
            <line
              x1={M.left}
              x2={M.left + innerW}
              y1={y(reference.value)}
              y2={y(reference.value)}
              stroke="var(--color-risk)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
            <text
              x={M.left + 6}
              y={y(reference.value) + 14}
              fontSize={11}
              fontWeight={600}
              fill="var(--color-risk)"
              paintOrder="stroke"
              stroke="var(--color-canvas)"
              strokeWidth={3}
            >
              {reference.label}
            </text>
          </g>
        )}
        {active !== null && (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={M.top}
            y2={M.top + innerH}
            stroke="var(--color-accent)"
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
        )}
        {series[0] && <path d={areaPath(series[0].values)} fill="url(#rollGradient)" aria-hidden />}
        {series.map((s) => (
          <path
            key={s.id}
            d={path(s.values)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((s) => {
          const i = active ?? s.values.findLastIndex((v) => v !== null);
          const v = s.values[i];
          if (v === null || v === undefined) return null;
          return (
            <circle
              key={s.id}
              cx={x(i)}
              cy={y(v)}
              r={4}
              fill={s.color}
              stroke="var(--color-canvas)"
              strokeWidth={2}
            />
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip x={x(active)} width={width}>
          <p className="mb-1 text-muted">{labels[active]}</p>
          {series.map((s) => {
            const v = s.values[active];
            return (
              <p key={s.id} className="flex items-center gap-2">
                <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: s.color }} />
                <span className="num font-semibold">
                  {v === null || v === undefined ? "–" : format(v)}
                </span>
                <span className="text-muted">{s.name}</span>
              </p>
            );
          })}
        </Tooltip>
      )}
    </div>
  );
}

export function ColumnChart({
  labels,
  values,
  tooltip,
  height = 160,
  label,
}: {
  labels: string[];
  values: number[];
  tooltip: (i: number) => string;
  height?: number;
  label: string;
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const bottom = 22;
  const top = 18;
  const innerH = height - top - bottom;
  const band = width / Math.max(labels.length, 1);
  const barW = Math.min(24, band - 2);
  const max = Math.max(1, ...values);
  const last = values.length - 1;
  const everyX = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(width / 70))));

  return (
    <div ref={ref} className="relative">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        className="block"
        onPointerLeave={() => setActive(null)}
      >
        <line x1={0} x2={width} y1={top + innerH} y2={top + innerH} stroke="var(--color-line)" />
        {values.map((v, i) => {
          const h = (v / max) * innerH;
          const cx = band * i + band / 2;
          const yTop = top + innerH - h;
          const r = Math.min(4, h);
          return (
            <g key={labels[i]} onPointerEnter={() => setActive(i)}>
              {/* Bigger than the mark, so a thumb can find it. */}
              <rect x={band * i} y={top} width={band} height={innerH} fill="transparent" />
              <path
                d={`M${cx - barW / 2} ${top + innerH}V${yTop + r}Q${cx - barW / 2} ${yTop} ${cx - barW / 2 + r} ${yTop}H${cx + barW / 2 - r}Q${cx + barW / 2} ${yTop} ${cx + barW / 2} ${yTop + r}V${top + innerH}Z`}
                fill="var(--color-series-1)"
                opacity={active === null || active === i ? 1 : 0.55}
              />
              {i === last && (
                <text
                  x={cx}
                  y={yTop - 5}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill="var(--color-ink)"
                  className="num"
                >
                  {v}
                </text>
              )}
              {i % everyX === 0 && (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="var(--color-muted)"
                >
                  {labels[i]}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {active !== null && (
        <Tooltip x={band * active + band / 2} width={width}>
          {tooltip(active)}
        </Tooltip>
      )}
    </div>
  );
}

/** Ranked bars with the first emphasised: one result, set against its baselines. */
export function CompareBars({
  rows,
}: {
  rows: { label: string; value: number; display: string; emphasis?: boolean }[];
}) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className={r.emphasis ? "font-medium" : "text-muted"}>{r.label}</span>
            <span className={`num ${r.emphasis ? "font-semibold" : "text-muted"}`}>
              {r.display}
            </span>
          </div>
          <div className="mt-1 h-2 rounded bg-surface">
            <div
              className="h-2 rounded-r"
              style={{
                width: `${Math.round(r.value * 100)}%`,
                background: r.emphasis ? "var(--color-series-1)" : "var(--color-series-muted)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {items.map((i) => (
        <li key={i.name} className="flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-3 rounded" style={{ background: i.color }} />
          {i.name}
        </li>
      ))}
    </ul>
  );
}
