// CareQueue mark: three bars of falling length, the longest highlighted (highest priority first).
export default function Logo({ title = 'CareQueue' }) {
  return (
    <svg viewBox="0 0 36 36" role="img" aria-label={title} xmlns="http://www.w3.org/2000/svg">
      <rect width="36" height="36" rx="9" fill="#0f3d42" />
      <rect x="8" y="9" width="20" height="4.5" rx="2.25" fill="#7fd6c2" />
      <rect x="8" y="16" width="14" height="4.5" rx="2.25" fill="#ffffff" fillOpacity=".88" />
      <rect x="8" y="23" width="8" height="4.5" rx="2.25" fill="#ffffff" fillOpacity=".6" />
    </svg>
  );
}
