// UndoBanner - shows undo option after deletion
interface UndoBannerProps {
  type: "chat" | "message";
  onUndo: () => void;
}

export function UndoBanner({ type, onUndo }: UndoBannerProps) {
  return (
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 -translate-y-2 z-50 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3">
      <span>{type === "chat" ? "Chat deleted" : "Message deleted"}</span>
      <button onClick={onUndo} className="font-medium hover:underline">
        Undo
      </button>
    </div>
  );
}
