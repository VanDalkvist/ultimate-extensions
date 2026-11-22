/** A status-line slot can appear on Terminal/Files, which do not mount <Panels />.
 * Navigate to the Agent surface first, then open the registered right panel.
 */
export function openUsageDetails(actions: {
  showSurface(surface: string): void
  openPanel(id: string): void
}): void {
  actions.showSurface('agent')
  actions.openPanel('subscription-usage')
}
