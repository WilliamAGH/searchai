// UndoBanner - shows undo option after deletion
interface UndoBannerProps {
  type: "chat" | "message";
  onUndo: () => void;
}

export function UndoBanner({ type, onUndo }: UndoBannerProps) {
  return (
    <div className="fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-gray-800 dark:bg-gray-900 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 font-serif dark:font-mono border border-gray-700 dark:border-gray-600">
      <span className="text-sm sm:text-base">
        {type === "chat" ? "Chat deleted" : "Message deleted"}
      </span>
      <button
        onClick={onUndo}
        className="font-medium hover:underline text-sm sm:text-base"
      >
        Undo
      </button>
    </div>
  );
}
