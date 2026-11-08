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
export function Icon({ name }: { name: string }) {
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
