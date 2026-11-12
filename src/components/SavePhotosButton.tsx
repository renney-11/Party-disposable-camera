type SavePhotosButtonProps = {
  disabled: boolean;
  label: string;
  onClick: () => void;
  showArrow: boolean;
};

export default function SavePhotosButton({
  disabled,
  label,
  onClick,
  showArrow,
}: SavePhotosButtonProps) {
  return (
    <button
      className="flex min-h-[58px] w-full items-center justify-center gap-[10px] border-0 bg-accent px-3 text-center font-display text-sm font-bold text-background enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
      {showArrow && (
        <svg
          className="h-[18px] w-[18px] shrink-0 stroke-current"
          aria-hidden="true"
          viewBox="0 0 18 18"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.6"
        >
          <path d="M5 13 13 5M5 5h8v8" />
        </svg>
      )}
    </button>
  );
}
