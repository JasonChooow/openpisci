import { Search, X } from "lucide-react";
import "./RoundedSearch.css";

export type RoundedSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  autoFocus?: boolean;
  className?: string;
  size?: "sm" | "md";
};

export default function RoundedSearch({
  value,
  onChange,
  placeholder,
  onSubmit,
  autoFocus,
  className,
  size = "md",
}: RoundedSearchProps) {
  return (
    <div className={`rounded-search rounded-search-${size}${className ? ` ${className}` : ""}`}>
      <Search className="rounded-search-icon" size={size === "sm" ? 14 : 16} strokeWidth={1.5} />
      <input
        className="rounded-search-input"
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) onSubmit(value);
        }}
      />
      {value && (
        <button
          type="button"
          className="rounded-search-clear"
          aria-label="Clear"
          onClick={() => onChange("")}
        >
          <X size={14} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
