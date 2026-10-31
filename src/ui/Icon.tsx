type IconName = 'arrow' | 'pause' | 'retry' | 'clock';
const paths: Record<IconName, string> = {
  arrow: 'M5 19 19 5M5 5h14v14',
  pause: 'M8 5v14M16 5v14',
  retry: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  clock: 'M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
};
export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`ui-icon icon-${name}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
