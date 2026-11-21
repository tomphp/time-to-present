import { onServerStatus } from "./commands";
import { find } from "./dom";
import { serverStatusView } from "./server-status-view";

const summary = find<HTMLSpanElement>("#server-summary");
const notice = find<HTMLParagraphElement>("#server-notice");

export function mountServerStatus() {
  onServerStatus((status) => {
    const view = serverStatusView(status);
    summary.textContent = view.summary;
    notice.textContent = view.notices.join(" · ");
    notice.hidden = view.notices.length === 0;
  });
}
