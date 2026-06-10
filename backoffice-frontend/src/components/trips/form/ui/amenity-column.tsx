import { Plus, Trash2 } from "lucide-react";
import { Label } from "./label";

export function AmenityColumn({
  title,
  items,
  placeholder,
  onAdd,
  onRemove,
  onChange,
}: {
  title: string;
  items: string[];
  placeholder: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, value: string) => void;
}) {
  return (
    <div>
      <Label>{title}</Label>
      <div className="mt-2 space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex gap-2">
            <input
              value={item}
              onChange={(event) => onChange(index, event.target.value)}
              className="h-9 min-w-0 flex-1 rounded-md border border-[#e6dfe5] bg-white px-3 text-sm outline-none"
              placeholder={placeholder}
            />
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="h-9 w-9 rounded-md bg-[#f4f2f7] text-[#6f7480]"
              aria-label={`Remove ${title} item ${index + 1}`}
            >
              <Trash2 size={13} className="mx-auto" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-3 flex items-center gap-2 text-xs font-bold text-[#e9272e]"
      >
        <Plus size={13} />
        Add Item
      </button>
    </div>
  );
}
