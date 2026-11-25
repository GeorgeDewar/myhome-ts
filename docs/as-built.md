
### Editing the plan

Use `PlanEditor` to update walls, rooms, openings, standard doors and sliding doors. For example, `updateWall(wall, { width: 200 })` sets the width in millimetres. Distance updates use millimetres, and updates to multiple properties are validated before they are applied. The editor rejects objects outside the plan and invalid values without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Field-specific errors appear under the relevant field; other errors appear above the action buttons. Invalid values do not change the plan.

Wall and fence endpoints, room names, and opening shapes, heights and floor offsets can be edited in these windows. Rectangle is the default opening shape and is omitted from saved JSON. Clearing an optional height or floor offset removes it from the saved plan.
Walls can also be marked virtual or attic.

Standard door properties include an open angle from 0 to 180 degrees, defaulting to 90. The optional `openAngle` is saved on the door.

Room walls are stored as ordered wall objects; JSON references are derived from those objects when saving. Each reference must contain a `ref` to a wall on the same level.

Room labels use the room name and automatic placement and font size unless overridden in the room's optional `label` object. Their separate properties window shows the room name, and allows independent multiline text, font size and rotation edits; unset values appear as placeholders, and clearing them restores the defaults. JSON stores newlines as `\n`, positions as center coordinates and font sizes as integers in millimetres, and rotations in anticlockwise degrees.

Inside a room, click the room to select it, then click its label to select the label. A label clicked outside its own room is selected immediately, taking precedence over overlapping items. When a click hits multiple items, use Alt to cycle through them. Drag a selected label to move it, drag a corner to resize its text, or drag the handle above it to rotate. Font size snaps to multiples of 30mm and rotation to 45-degree increments unless Ctrl is held. Hold Shift while resizing to anchor the opposite corner. Double-clicking the label inside the room opens room properties unless the room or label was already selected; in that case it opens label properties. Double-clicking the label outside its room opens label properties. Enter or the context menu edits the selected item. These controls are unavailable when the room-label layer is hidden.

Drag the 2D plan to pan; releasing after a pan does not change the selection.

The optional LINZ basemap uses WebMercatorQuad, with street-map and aerial-imagery styles, property boundaries, building outlines and address labels where available. Enter a LINZ API key in the Layers panel; it is stored in browser local storage and is not included in downloaded plans. Local storage is accessible to scripts running on the same origin and is not encrypted. Use coordinates or the browser's current-location permission to start alignment. The entered location is initially placed at the plan centre. In alignment mode, drag the map beneath the plan, choose an anchor on the plan (nearby wall and fence endpoints snap), and rotate by dragging the anchor's handle or adjusting the bearing in degrees. Handle rotation uses 0.1-degree increments. Rotation and zoom stay centred on the anchor. Apply saves the placement; Cancel discards the preview. Outside alignment mode, panning and zooming move the plan and map together.

The optional `georeference` in plan JSON stores the latitude and longitude of the plan origin and the clockwise bearing of the plan's upward axis from true north, from 0 degrees inclusive to 360 degrees exclusive; the alignment anchor is temporary. Plan coordinates remain in local metres, with ellipsoidal ground-scale correction applied to the Web Mercator map at the origin. Basemap visibility is stored locally; style and opacity are session settings. Separate opacity controls apply inside the union of the displayed level's room polygons and outside it; areas without rooms count as outside. Map data may be inaccurate and is not a survey. LINZ attribution is shown with the basemap.

The 2D plan shows a compass when a georeference is available and the Compass layer is enabled, including during alignment and when the basemap is hidden.

Selected objects can be deleted with Delete or their context menu. Deleting a wall also deletes its openings and any rooms that reference it; deleting an opening deletes its contents. Deletion goes through `PlanEditor` and notifies the views.

Ctrl-click (Cmd-click on macOS) adds or removes rooms from the selection in the plan, 3D view or hierarchy. Right-clicking a selected room offers Merge rooms when the selected rooms form a connected, non-overlapping area representable by one wall boundary. The merged room keeps the right-clicked room's name; shared walls and their openings remain in the plan. Delete still removes only the active object.

The Add menu creates walls and fences from millimetre endpoints, openings on a selected wall, and items in a selected opening. Room creation is not yet available in the UI. New IDs are generated within their parent. Fences can also be selected, edited and deleted from the plan or hierarchy. These operations use `PlanEditor`, which validates the parent, positions and dimensions before changing the plan.

Draw wall also creates a wall by clicking two points in the 2D plan; coordinates are snapped to integer millimetres. Escape cancels the tool.

The Layers panel controls visibility in the 2D plan only. Fences, normal walls, room labels, doors and the compass are visible by default; virtual and attic walls are hidden by default and shown with a dashed gray outline when enabled. A wall marked both virtual and attic is visible when either layer is enabled. Doors and windows are hidden when their wall is hidden. Hidden objects remain available in the hierarchy. Layer visibility settings are stored locally, not in the plan.

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
