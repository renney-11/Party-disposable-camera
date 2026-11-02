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
      className="flex min-h-[54px] w-full items-center justify-center gap-[10px] border-0 bg-accent px-3 text-center font-mono text-sm font-semibold text-background enabled:cursor-pointer disabled:cursor-not-allowed disabled:opacity-55"
      type="button"
      disabled={disabled}
      onClick={onClick}
    >
      <svg
        className="h-[19px] w-[19px] shrink-0 stroke-current"
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      >
        <path d="M10 2.5v10m0 0 4-4m-4 4-4-4M3.5 13.5v3h13v-3" />
      </svg>
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
