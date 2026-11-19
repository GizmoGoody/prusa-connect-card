# Prusa Connect Card

A Home Assistant dashboard card for Prusa 3D printers. It is Home Assistant's own **tile card**, wrapped: the card builds a tile card for the printer's State sensor and adds to it. Everything a tile card does works the same way, with the same editor. The card layers on top:

- **The printer's colors:** the frame of its family (CORE, MINI, MK, Pro HT90 or XL) behind the card, and on the CORE Family a door whose RGB status bar lights up as the printer's does.
- **Badges** on the state icon: the active tool on a multi-tool printer, a Prusa Connect update, and whether Prusa Connect reaches the printer.
- **A progress edge** along the card while a print runs.
- **Collapsing** to the title row with a tap, and following the print: the card expands when a print starts and collapses when it finishes or is stopped.
- **Prusa features**, added like any tile feature: Prusa print, Prusa temperatures, Prusa history, Prusa nozzles, Prusa movement, Prusa lights, Prusa utilities and Prusa cameras. In each feature, you choose which controls to show and in what order.

The card needs the [Prusa Connect (on-premise) integration](https://github.com/prusa3d/prusa-connect-homeassistant).

> [!WARNING]
> **Alpha developmental software. Use with caution.** This card exposes controls for Prusa printers, including heater targets and print controls. Check every control and entity on your printer before relying on it, and keep the manufacturer's safety procedures in place.

> [!IMPORTANT]
> **Pre-release: expect changes.** While the card is a pre-release, its design, its configuration options and its editor can all change from one release to the next. An update may need you to set a card up again.

## Controls the integration does not offer yet

The card is ready for controls that the Prusa Connect integration does not offer yet:

- the chamber temperature and its target, and the chamber fan (Off, Auto or a manual speed, as Prusa Connect sets it)
- the chamber light
- flow
- Home and Disable steppers
- Beep and Reset printer

The editor lists them as "(not offered yet)". A feature shows them as soon as the integration offers their entities, with no change to the card. If you would like these controls, please add your support to [the integration's issue #14](https://github.com/prusa3d/prusa-connect-homeassistant/issues/14).

## Installation

### Marketplace (Home Assistant 2026.11 and later)

The card is published only as alpha pre-releases for now, so the Marketplace offers it once you turn on its **Pre-release** switch.

1. Go to **Settings → Marketplace**, open the menu (⋮) at the top right, and choose **Add from link**.
2. Under **GitHub link**, enter `GizmoGoody/prusa-connect-card`. If you are asked for a type, choose **Dashboard**. Select **Add**.
3. Go to **Settings → Devices & services → Marketplace**, and open the **Prusa Connect Card** device. Enable its **Pre-release** entity, then turn the switch on.
4. Install the card from its page under **Settings → Marketplace**, and reload the browser.

Each new alpha then shows up as an update.

On Home Assistant 2026.10 or earlier, use HACS the same way: under **Custom repositories**, add the link with the type **Dashboard**, then turn on its pre-releases.

### Manual

1. Download `prusa-connect-card.js` from the [latest release](https://github.com/GizmoGoody/prusa-connect-card/releases) and copy it to `config/www/`.
2. In **Settings → Dashboards → ⋮ → Resources**, add `/local/prusa-connect-card.js` as a **JavaScript module**.
3. Reload the browser.

## Adding the card

Edit a dashboard, choose **Add card**, and pick **Prusa Connect Card**. Choose your printer: the card uses its State sensor. The card's own options are in the **Prusa** panel of the editor, below the tile card's options. Add features under **Features**, as on any tile card.

## Configuration

Every option of the tile card works as on a tile card, except that the card draws the icon itself (it has no `icon` or `show_entity_picture`). The card changes three of the tile card's defaults:

| Option | Default on this card |
| --- | --- |
| `name` | the printer's name (its device's) |
| `state_content` | `state`, `progress` and `time_remaining` (any of the printer's sensors can be added, such as `tool_1_material` or `job_name`) |
| `features_position` | `inline` |

The card's own options:

| Option | Default | What it does |
| --- | --- | --- |
| `style.family` | the printer's | `core` (CORE One, including the INDX), `mini`, `mk`, `ht90`, `xl`, `custom`, or `none` to follow your theme |
| `style.frame` | the family's | The frame color, such as `"#434242"` |
| `style.door` | the family's | The door color, such as `"#141619"`. Adds a door to any family |
| `style.status_bar` | `true` | The door lights up as the printer's RGB status bar does |
| `style.reflections` | `4242` | The seed of the door's reflections (**Randomize reflections** in the editor) |
| `features_style` | `console` | `match`, `flat` or `console` |
| `enabled_color` | `info` | The color of keys that are on, and of sliders |
| `status_badge` | `[active_tool, server_update]` | The statuses the top right badge shows, the first that applies |
| `connection_badge` | `true` | The bottom right badge: connected, disconnected or unavailable |
| `progress_edge` | `edge: top` | `edge`, `thickness`, `starts_at`, `ends_at`, `direction`, `color`, `show_percentage`, `show_while` |
| `collapsible` | `true` | A tap shows or hides the features |
| `expanded_at_load` | `false` | Expanded when the dashboard loads (the card otherwise remembers how you left it) |
| `expand_when_job_starts` | `true` | Expand when a print starts |
| `collapse_when_job_ends` | `true` | Collapse when a print finishes or is stopped |
| `last_feature_full_width` | `true` | A last feature alone in its row stretches across both columns |

### Features

| Feature | Controls (defaults in bold) | Options |
| --- | --- | --- |
| Prusa print | **`pause_resume`**, `pause`, `resume`, **`stop`**, **`progress`**, **`time_remaining`**, `time_printing`, `finish_time`, `job_name` | `show`, `ask_before_stopping` |
| Prusa temperatures | **`tool_N_nozzle_temperature_and_target`**, `tool_N_nozzle_temperature`, `tool_N_nozzle_target_temperature`, the same for `bed` and `chamber`, **`chamber_fan`**, **`presets`**, **`cool_down`** | `show`, `animate_fan` |
| Prusa history | the heaters' readings and targets, as `entities` | `hours_to_show`, `min_y_axis`, `max_y_axis`, `fit_y_data`, `full_width` |
| Prusa nozzles | per tool: **`material`**, **`nozzle_diameter`**, `nozzle_high_flow`, `nozzle_hardened`, **`active`**, **`print_fan_speed`**, `heatbreak_fan_speed` | `show`, `animate_fan` |
| Prusa movement | **`speed`**, **`flow`**, **`axis_z`**, **`axis_x`**, **`axis_y`**, `home`, `disable_steppers` | `show`, `only_z_while_printing`, `units` |
| Prusa lights | `chamber_light`, `chamber_light_brightness` | `off_at_minimum` |
| Prusa utilities | `beep`, `reset_printer` | `show`, `ask_before_resetting` |
| Prusa cameras | **`camera_buttons`**, `camera_toggle`, **`crop`** | `camera`, `camera_view`, `show`, `show_last_updated`, `full_width` |

`show` is `icons` (the default), `names`, or `both`.

### Example

```yaml
type: custom:prusa-connect-card
entity: sensor.core_one_state
style:
  family: core
  status_bar: true
features_style: console
progress_edge:
  edge: around
  show_percentage: true
features:
  - type: custom:prusa-print
  - type: custom:prusa-temperatures
    controls:
      - tool_1_nozzle_temperature_and_target
      - bed_temperature_and_target
      - chamber_temperature_and_target
      - chamber_fan
      - presets
      - cool_down
  - type: custom:prusa-history
    hours_to_show: 3
  - type: custom:prusa-cameras
    camera_view: auto
    full_width: true
```

## Tests

The tests in `tests/card` load the card in a headless browser, with stand-ins for the parts of Home Assistant's frontend it uses (a CORE One, an MK4S, a five-tool XL and a CORE One with the controls the integration does not offer yet):

```sh
python tests/card/run_card_tests.py
```

They need Chrome, Chromium or Edge, and nothing else.

## License

MIT. See [LICENSE](LICENSE).
