export function getQueryParams(): { alert?: string | null; endpoint?: string | null } {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.search);
  return {
    alert: params.get('alert'),
    endpoint: params.get('endpoint')
  };
}
