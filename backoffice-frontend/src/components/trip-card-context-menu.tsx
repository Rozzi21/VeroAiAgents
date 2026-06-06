"use client";

import { useEffect, useRef } from "react";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { TripPackage, TripStatus } from "@/lib/api";

type MenuAction = {
  id: string;
  label: string;
  icon: React.ReactNode;
  tone?: "danger";
  onSelect: () => void;
};

type TripCardContextMenuProps = {
  trip: TripPackage;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: (trip: TripPackage) => void;
  onDelete: (trip: TripPackage) => void;
  onStatusChange: (trip: TripPackage, status: TripStatus) => void;
};

function getMenuActions(
  trip: TripPackage,
  handlers: Pick<
    TripCardContextMenuProps,
    "onEdit" | "onDelete" | "onStatusChange"
  >
): MenuAction[] {
  const status = trip.status.toLowerCase();
  const actions: MenuAction[] = [
    {
      id: "edit",
      label: "Edit",
      icon: <Pencil size={15} />,
      onSelect: () => handlers.onEdit(trip),
    },
    {
      id: "delete",
      label: "Delete",
      icon: <Trash2 size={15} />,
      tone: "danger",
      onSelect: () => handlers.onDelete(trip),
    },
  ];

  if (status === "published") {
    actions.push({
      id: "make-pending",
      label: "Make Pending",
      icon: <EyeOff size={15} />,
      onSelect: () => handlers.onStatusChange(trip, "pending"),
    });
  }

  if (status === "pending" || status === "completed") {
    actions.push({
      id: "make-published",
      label: "Make Published",
      icon: <Eye size={15} />,
      onSelect: () => handlers.onStatusChange(trip, "published"),
    });
  }

  return actions;
}

export function TripCardContextMenu({
  trip,
  position,
  onClose,
  onEdit,
  onDelete,
  onStatusChange,
}: TripCardContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const actions = getMenuActions(trip, { onEdit, onDelete, onStatusChange });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[190px] overflow-hidden rounded-xl border border-[#eceaf2] bg-white py-1.5 shadow-[0_20px_50px_-20px_rgba(17,24,39,0.45)]"
      style={{ top: position.y, left: position.x }}
      role="menu"
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={cn(
            "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-semibold transition hover:bg-[#faf9ff]",
            action.tone === "danger"
              ? "text-[#c1121f] hover:bg-[#fdf2f4]"
              : "text-[#353944]"
          )}
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  );
}
