# Prusa Connect Card: behavior spec

The tests check the card against this list. It comes from the decisions in the mockup rounds, your feedback from testing in Home Assistant, and what the card does today.

Every behavior has an ID. Each check is named by that ID, or by the subject it shares with neighboring checks (for example, "crop").

The tests are in two places:
- **Browser pages, `tests/browser/*.html`:**
  - They load the built card, with stand-ins for the parts of the Home Assistant frontend that it uses.
  - To run them, build the card, then run `python tests/browser/run.py [card.js]`.
- **Unit tests, `tests/unit/*.test.ts`:**
  - They check the parts of the card that need no page.
  - To run them: `npm test`.

## The card
| ID | Behavior | Checked in |
| --- | --- | --- |
| K-1 | The card is Home Assistant's tile card, wrapped. It uses the printer's device name, shows state, progress and time remaining, and places its features inline. | card.html "tile", unit "the tile card inside" |
| K-2 | Tapping the card collapses or expands it. Collapsed, it keeps the first feature beside the title. A tap between the features does nothing. | card.html "collapse" |
| K-3 | The card follows the print job: it expands when a print starts and collapses when the print finishes or is stopped. Only a change of state does either. | card.html "job" |
| K-4 | Every sensor of the printer is an attribute that State content can show. The state's icon moves and takes the state's color. | card.html "tile" |
| K-5 | The connection badge is at the bottom right: connected, disconnected or unavailable. The status badge is at the top right: the XL's active tool, or a server update. | card.html "badges" |
| K-6 | The progress edge shows while printing and is hidden while idle. | card.html "progress edge" |
| K-7 | A new card starts with a printer, Prusa print and Prusa temperatures. | card.html "stub" |
| B-1 | The console badge is GizmoGoody's card-badge: 🖨️ Prusa Connect Card, its version and the repository link. | feedback.html |
| B-2 | Badges are the xTool card's size: an 18 px circle with a 12 px icon. Never smaller. | feedback.html |

## Style
| ID | Behavior | Checked in |
| --- | --- | --- |
| Y-1 | There is one style per PrusaSlicer wizard family: core (which includes the INDX), mini, mk and xl. The Pro HT90 has its own style, ht90. There are also custom and none. Only the CORE family has a door. A door color adds a door to any family. | card.html "style", unit "styles" |
| Y-2 | The RGB status bar is on by default. It is blue while printing and green when finished. It pulses yellow when paused or needing attention, and red on an error. | card.html "status bar", unit "styles" |
| Y-3 | Wrong options are refused with a message, for example an unknown family. `style` must be a set of options. | card.html "options", editor.html "options" |

## Layout and spacing
| ID | Behavior | Checked in |
| --- | --- | --- |
| L-1 | Features are half width, placed as in the xTool card. Exceptions: a feature with Full width, and a feature alone in its row when Last feature full width is on. A feature that shows nothing takes no place. A feature left alone in its row by a full-width feature after it takes both columns, whatever Last feature full width is. | unit "featurePlaces" |
| L-2 | Full width is on by default for the camera and off for the history. | feedback.html |
| L-3 | Heater cells fill the feature: two to a half-width column, with no blank space. | features.html "temperatures" |
| L-4 | Spacing follows the tile card (56 / 36 / 12), plus xTool's margin under the title row. It is the same collapsed and expanded. | real Home Assistant |
| L-5 | Corners follow the theme, so a pill-shaped theme stays pill-shaped. A container's radius matches its children's. | real Home Assistant |

## Features
| ID | Behavior | Checked in |
| --- | --- | --- |
| N-1 | Feature names are "Prusa" and one word, in sentence case. | feedback.html |
| S-1 | Show is set to Icons by default in every feature. With Icons, a value that is not known shows only its icon, never "Unknown". | feedback.html, features.html "print, idle" |
| U-1 | Fan speeds and the nozzle diameter show no unit. | feedback.html |
| U-2 | Positions show mm only when Units is on, which it is not by default. | feedback.html |
| R-1 | Pause or resume is one key. Stop asks first. Keys that cannot be used now are disabled. | features.html "print" |
| H-1 | A heater and its target are one control: the reading and the target (or OFF), and the temperature sensor's icon. | features.html "temperatures", feedback.html |
| H-2 | Heaters are marked as Prusa Connect does: heating (an up arrow, pulsing), cooling (a down arrow), at temperature, off. | unit "heaterState" |
| H-3 | Tap a heater to type a target. Press and slide to change it, with a dead zone and growing speed. Hold to turn that heater off, and hold again to restore its target. | features.html "temperatures, hold" |
| H-4 | A heater's icon, reading and target are centered in its cell; the reading and the target are centered on each other. | feedback.html |
| H-5 | Chamber controls show once the integration offers them. | features.html "temperatures, future" |
| H-6 | The higher number is on top: the target while it is above the reading, else the reading. Off is always under the reading. The heating or cooling arrow sits beside both numbers, as tall as the two. | feedback.html |
| H-7 | A heater's field is in its history colors: the reading in the heater's color, the target dimmed. They are the colors given in the card's Prusa history feature, or else Prusa Connect's palette. | feedback.html |
| H-8 | A heater's numbers are never cut short (no ...): when the field is too narrow, the units are left out. The arrow is a thin one. | feedback.html |
| P-1 | Presets (Prusa Connect's) set every nozzle and the bed, never the chamber. | feedback.html |
| P-2 | Cool down turns every heater off, the chamber included. | feedback.html |
| F-1 | The chamber fan has Off, A and Manual, as Prusa Connect sets it. Manual returns to the last manual speed. | feedback.html |
| F-2 | A fan's icon turns while it runs (animate_fan, on by default). | feedback.html |
| M-1 | Movement shows only Z while printing (only_z_while_printing, on by default). | features.html "movement" |
| Z-1 | Nozzles has one row per tool. | features.html "nozzles" |
| G-1 | History is Home Assistant's own history graph card, in Prusa Connect's palette. Each target is its reading's color, dimmed. | features.html "history", unit "history" |
| G-2 | History legend names are short: Nozzle, Nozzle 2, Bed, Chamber, each with "target" after a target. | features.html "history", unit "history" |
| G-3 | The chart fills the feature, which has a set height (a minimum alone leaves the chart 0 px tall). Home Assistant fits the legend. | features.html "history" |
| G-4 | The history's editor has the history graph card's own fields, except Logarithmic scale. Hours to show takes any number from 0 (such as 0.25), and can be left empty (an hour). Zoom and pan are the graph's own (pinch or scroll, and drag). | feedback.html |
| G-5 | Colors: a color for each heater, chosen as Home Assistant's own editor chooses a line's color. The target is the same color, dimmed. | feedback.html |
| C-1 | Cameras shows any camera entity. The default is the printer's own. | features.html "cameras" |
| C-2 | Crop is set with two taps on the picture. It is never set in the editor, and kept only for the session. | features.html "crop" |
| C-3 | Once a crop is set, it is not asked for again, and the Crop key stays on. It stays until Crop is turned off. As in the xTool card, the picture fills its box (cover); a crop only zooms it, the same both ways, so neither the box nor the picture ever changes shape. | features.html "crop", feedback.html |
| C-4 | With Crop off, the whole picture shows, in the same box. | features.html "crop", feedback.html |
| E-1 | Controls the integration does not offer yet are listed as not offered yet. The editor links to issue #14 and asks people to add their support. | features.html "feature editor" |

## Editor
| ID | Behavior | Checked in |
| --- | --- | --- |
| T-ED-1 | No editor form is ever without a schema. | editor.html "editor" |
| T-ED-2 | The printer is chosen as a device of the integration. | editor.html "printer" |
| T-ED-3 | The tile card's own editor is used, without the entity, icon and picture options. | editor.html "tile editor" |
| O-1 | Options at their defaults are not saved. | editor.html "editor", unit "options" |
