import { useT } from "@/i18n";

export function StaticScene() {
  const t = useT();
  return (
    <svg
      viewBox="0 0 800 500"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
      role="img"
      aria-label={t.staticSceneDescription}
      data-testid="static-scene"
    >
      <path d="M0 340H800V420H0Z" fill="#d9cfbb" />
      <path d="M360 120H440V500H360Z" fill="#d9cfbb" />
      <g fill="#c5d5c0" stroke="#718575" strokeWidth="2">
        <path d="M100 270h90v70h-90zM220 225h100v115H220zM480 240h90v100h-90zM610 275h100v65H610z" />
      </g>
      <g fill="#aebf9d">
        <circle cx="70" cy="300" r="25" />
        <circle cx="750" cy="300" r="30" />
        <circle cx="475" cy="450" r="24" />
      </g>
      <path d="M365 345h70v70h-70z" fill="#f0e6d5" stroke="#b68e67" strokeDasharray="7 5" />
    </svg>
  );
}
