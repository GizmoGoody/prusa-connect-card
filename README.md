# Prusa Connect Card

A Home Assistant dashboard card for Prusa 3D printers. It is Home Assistant's own **tile card**, wrapped: the card builds a tile card for the printer's State sensor and adds to it. Everything a tile card does works the same way, with the same editor. The card layers on top:

- **A state picture** of the printer in its model's colors, with a progress edge while a job runs.
- **Collapsing** to the title row with a tap, and following the print job: it expands when a job starts and collapses when the job ends.
- **Prusa features**, added like any tile feature and grouped like the printer's page in Prusa Connect: Job, Print controls, Temperatures (a graph with targets), Tools, Motion and Camera. In each feature, you choose which controls to show and in what order.

The card needs the [Prusa Connect (on-premise) integration](https://github.com/prusa3d/prusa-connect-homeassistant).

> [!WARNING]
> **Alpha developmental software. Use with caution.** This card can expose controls for Prusa printers, including heater targets and print controls. Check every control and entity on your printer before relying on it, and keep the manufacturer's safety procedures in place.

> [!IMPORTANT]
> **Pre-release: expect changes.** While the card is a pre-release, its design, its configuration options and its editor can all change from one release to the next. An update may need you to set a card up again.

## Status

This card is in the **design stage**. There is no card to install yet. The [interactive mockups](https://gizmogoody.github.io/prusa-connect-card/) show the planned card, its features and its editor.

## License

MIT. See [LICENSE](LICENSE).
