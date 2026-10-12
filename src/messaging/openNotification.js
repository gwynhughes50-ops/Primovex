import { isCardMessage } from "./messageCard";

// "Open" on a notification. A message from a colleague, a reply, or an alert that needs action opens as the card in the
// middle of the screen (its own address is the notifications list, which is where the person already is); anything else
// goes to the page it is about.
export function openNotification(item, navigate) {
  if (!item) return;
  if (isCardMessage(item)) {
    window.dispatchEvent(new CustomEvent("primovex:open-message", { detail: { id: item.id } }));
    return;
  }
  if (item.actionUrl) navigate(item.actionUrl);
}
