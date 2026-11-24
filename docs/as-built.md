
### Editing the plan

Use `PlanEditor` to update walls, rooms, openings, standard doors and sliding doors. For example, `updateWall(wall, { width: 200 })` sets the width in millimetres. Distance updates use millimetres, and updates to multiple properties are validated before they are applied. The editor rejects objects outside the plan and invalid values without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Field-specific errors appear under the relevant field; other errors appear above the action buttons. Invalid values do not change the plan.

Wall and fence endpoints, room names, and opening shapes, heights and floor offsets can be edited in these windows. Rectangle is the default opening shape and is omitted from saved JSON. Clearing an optional height or floor offset removes it from the saved plan.
Walls can also be marked virtual or attic.

Standard door properties include an open angle from 0 to 180 degrees, defaulting to 90. The optional `openAngle` is saved on the door.

Room walls are stored as ordered wall objects; JSON references are derived from those objects when saving. Each reference must contain a `ref` to a wall on the same level.

Room labels use the room name and automatic placement and font size unless overridden in the room's optional `label` object. The room properties window allows an independent multiline label text; clearing it restores the name. JSON stores newlines as `\n`, positions as center coordinates in integer millimetres, font sizes in millimetres and rotations in anticlockwise degrees.

Click a label in the 2D plan to select it; drag it to move, drag a corner to resize its text, or drag the handle above it to rotate. Rotation snaps to 45-degree increments unless Ctrl is held. Double-clicking a label opens its room properties. These controls are unavailable when the room-label layer is hidden.

Selected objects can be deleted with Delete or their context menu. Deleting a wall also deletes its openings and any rooms that reference it; deleting an opening deletes its contents. Deletion goes through `PlanEditor` and notifies the views.

Ctrl-click (Cmd-click on macOS) adds or removes rooms from the selection in the plan, 3D view or hierarchy. Right-clicking a selected room offers Merge rooms when the selected rooms form a connected, non-overlapping area representable by one wall boundary. The merged room keeps the right-clicked room's name; shared walls and their openings remain in the plan. Delete still removes only the active object.

The Add menu creates walls and fences from millimetre endpoints, openings on a selected wall, and items in a selected opening. Room creation is not yet available in the UI. New IDs are generated within their parent. Fences can also be selected, edited and deleted from the plan or hierarchy. These operations use `PlanEditor`, which validates the parent, positions and dimensions before changing the plan.

Draw wall also creates a wall by clicking two points in the 2D plan; coordinates are snapped to integer millimetres. Escape cancels the tool.

The Layers panel controls visibility in the 2D plan only. Fences, normal walls, room labels and doors are visible by default; virtual and attic walls are hidden by default and shown with a dashed gray outline when enabled. A wall marked both virtual and attic is visible when either layer is enabled. Doors and windows are hidden when their wall is hidden. Hidden objects remain available in the hierarchy. Layer settings are not saved to the plan.

Positions use integer millimetres in JSON and floating-point metres in memory. This includes wall and fence endpoints and opening offsets; widths and other dimensions may be fractional. Position edits must be integers that round-trip accurately through the in-memory representation.

### 3D view

The 3D view shows all levels, room floors, fences, wall openings and their contents. Levels are ordered by number and stacked using each level's total height, or its ceiling height if total height is absent. Level 0 is at ground level; if there is no level 0, the lowest level is at ground level. Missing level heights use 2.4m for display. Missing fence heights use 1.8m, and missing opening heights use 2.1m. These defaults are not saved.

Selections in the hierarchy and 2D plan are highlighted in 3D. Clicking a 3D object selects it and locks the pointer for camera movement; Escape releases the pointer. The 3D context menu and double-click editing use the same selection and property windows as the other views.

Openings are clipped to their wall, and overlapping openings are combined when cutting the wall. The schema does not yet describe positions within an opening, so each item is shown across the opening rather than arranged independently. Virtual and attic walls have no 3D solid for now.

Opening shapes do not yet affect rendering; openings are displayed as rectangular.

Standard doors are shown at their current open angle in both views; sliding doors do not use an open angle.

### Loading plans

Plans are validated against `schema.json` as they load. Items with fractional positions are ignored with a warning. Invalid buildings, levels, walls, fences, openings, opening items and rooms are omitted, and the app lists warnings identifying their locations. Children of an invalid item are not checked. Walls are checked before rooms so that warnings about invalid walls appear before warnings about rooms that reference them.

Unexpected properties produce warnings without excluding otherwise valid objects. They are ignored and are not included in downloaded JSON.

Wall IDs must be unique within a level, opening IDs within a wall, level numbers within a building, and fence IDs within the plan. The first valid item is retained when an ID or level number is duplicated. Positive dimensions must also remain positive when saved. Warnings are not saved to the plan; downloading JSON exports only the retained items.
