
### Editing the plan

Use `PlanEditor` to update walls, rooms, openings, standard doors and sliding doors. For example, `updateWall(wall, { width: 200 })` sets the width in millimetres. Distance updates use millimetres, and updates to multiple properties are validated before they are applied. The editor rejects objects outside the plan and invalid values without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify. Setting a default value explicitly is a change because it will be saved in the JSON.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Invalid values are reported in the window and do not change the plan.

Room walls are stored as ordered wall objects; JSON references are derived from those objects when saving. Each reference must contain a `ref` to a wall on the same level. `PlanEditor.updateRoom` can update the wall list and rejects walls outside the room's level.

Selected objects can be deleted with Delete or their context menu. Deleting a wall also deletes its openings and any rooms that reference it; deleting an opening deletes its contents. Deletion goes through `PlanEditor` and notifies the views.

Positions use integer millimetres in JSON and floating-point metres in memory. This includes wall and fence endpoints and opening offsets; widths and other dimensions may be fractional. Position edits must be integers that round-trip accurately through the in-memory representation.

### Loading plans

Plans are validated against `schema.json` as they load. Items with fractional positions are ignored with a warning. Invalid buildings, levels, walls, fences, openings, opening items and rooms are omitted, and the app lists warnings identifying their locations. Children of an invalid item are not checked. Walls are checked before rooms so that warnings about invalid walls appear before warnings about rooms that reference them.

Wall IDs must be unique within a level, opening IDs within a wall, level numbers within a building, and fence IDs within the plan. The first valid item is retained when an ID or level number is duplicated. Positive dimensions must also remain positive when saved. Warnings are not saved to the plan; downloading JSON exports only the retained items.
