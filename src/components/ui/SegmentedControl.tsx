import "./SegmentedControl.css";

export type SegmentItem<T extends string = string> = {
  id: T;
  label: string;
  icon?: React.ReactNode;
  count?: number;
};

export type SegmentedControlProps<T extends string = string> = {
  items: SegmentItem<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
};

export default function SegmentedControl<T extends string = string>({
  items,
  value,
  onChange,
  size = "md",
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      className={`segmented segmented-${size}${className ? ` ${className}` : ""}`}
      role="tablist"
      aria-label={rest["aria-label"]}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={value === item.id}
          className={`segmented-item${value === item.id ? " active" : ""}`}
          onClick={() => onChange(item.id)}
        >
          {item.icon && <span className="segmented-icon">{item.icon}</span>}
          <span className="segmented-label">{item.label}</span>
          {typeof item.count === "number" && (
            <span className="segmented-count">{item.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
