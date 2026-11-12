import type { ButtonHTMLAttributes } from "react";
const icons: Record<string, string> = {
  send: "imgKhung",
  close: "imgKhung1",
  reset: "imgKhung2",
  axes: "imgKhung3",
  grid: "imgKhung4",
  eye: "imgKhung5",
  panel: "imgKhung6",
  delete: "imgKhung7",
  transform: "imgKhung8",
  angle: "imgKhung9",
  perpendicular: "imgKhung10",
  circle: "imgKhung11",
  polygon: "imgKhung12",
  segment: "imgKhung13",
  point: "imgKhung14",
  select: "imgKhung15",
  redo: "imgKhung16",
  undo: "imgKhung17",
};
const symbols: Record<string, string> = {
  more: "M5 12h.01M12 12h.01M19 12h.01",
  chevron: "m7 10 5 5 5-5",
  plus: "M12 5v14M5 12h14",
  sessions:
    "M8 3H4a1 1 0 0 0-1 1v12M8 7h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z",
  chat: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2ZM7 9h10M7 13h6",
  info: "M12 11v6M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  check: "m5 12 4 4L19 6",
  search: "m16 16 5 5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
};
export function Icon({ name }: { name: string }) {
  if (symbols[name])
    return (
      <svg
        className="icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={name === "more" ? 3.5 : 1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={symbols[name]} />
      </svg>
    );
  return (
    <img
      className="icon"
      src={`/icons/${icons[name] || icons.point}.svg`}
      alt=""
      draggable={false}
    />
  );
}
export function IconButton({
  icon,
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: string; label: string }) {
  return (
    <button
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      {...props}
    >
      <Icon name={icon} />
    </button>
  );
}
