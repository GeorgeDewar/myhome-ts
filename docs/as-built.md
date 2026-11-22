
### Editing the plan

Use `PlanEditor` to update walls, rooms, openings, standard doors and sliding doors. For example, `updateWall(wall, { width: 200 })` sets the width in millimetres. Distance updates use millimetres, and updates to multiple properties are validated before they are applied. The editor rejects objects outside the plan and invalid values without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify. Setting a default value explicitly is a change because it will be saved in the JSON.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Invalid values are reported in the window and do not change the plan.

Wall and fence endpoints, room names, and opening heights and floor offsets can be edited in these windows. Clearing an optional height or floor offset removes it from the saved plan.
Walls can also be marked virtual. Virtual walls are hidden in the 2D plan and can be edited again via the hierarchy.

Room walls are stored as ordered wall objects; JSON references are derived from those objects when saving. Each reference must contain a `ref` to a wall on the same level.

Selected objects can be deleted with Delete or their context menu. Deleting a wall also deletes its openings and any rooms that reference it; deleting an opening deletes its contents. Deletion goes through `PlanEditor` and notifies the views.

The Add menu creates walls and fences from millimetre endpoints, openings on a selected wall, and items in a selected opening. Room creation is not yet available in the UI. New IDs are generated within their parent. Fences can also be selected, edited and deleted from the plan or hierarchy. These operations use `PlanEditor`, which validates the parent, positions and dimensions before changing the plan.

Draw wall also creates a wall by clicking two points in the 2D plan; coordinates are snapped to integer millimetres. Escape cancels the tool.

Positions use integer millimetres in JSON and floating-point metres in memory. This includes wall and fence endpoints and opening offsets; widths and other dimensions may be fractional. Position edits must be integers that round-trip accurately through the in-memory representation.

### 3D view

The 3D view shows all levels, room floors, fences, wall openings and their contents. Levels are ordered by number and stacked using each level's total height, or its ceiling height if total height is absent. Level 0 is at ground level; if there is no level 0, the lowest level is at ground level. Missing level heights use 2.4m for display. Missing fence heights use 1.8m, and missing opening heights use 2.1m. These defaults are not saved.

Selections in the hierarchy and 2D plan are highlighted in 3D. Clicking a 3D object selects it and locks the pointer for camera movement; Escape releases the pointer. The 3D context menu and double-click editing use the same selection and property windows as the other views.

Openings are clipped to their wall, and overlapping openings are combined when cutting the wall. The schema does not yet describe positions within an opening, so each item is shown across the opening rather than arranged independently. Virtual walls define rooms but have no 3D solid.

### Loading plans

Plans are validated against `schema.json` as they load. Items with fractional positions are ignored with a warning. Invalid buildings, levels, walls, fences, openings, opening items and rooms are omitted, and the app lists warnings identifying their locations. Children of an invalid item are not checked. Walls are checked before rooms so that warnings about invalid walls appear before warnings about rooms that reference them.

Wall IDs must be unique within a level, opening IDs within a wall, level numbers within a building, and fence IDs within the plan. The first valid item is retained when an ID or level number is duplicated. Positive dimensions must also remain positive when saved. Warnings are not saved to the plan; downloading JSON exports only the retained items.
