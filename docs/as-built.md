
### Editing the plan

Use `PlanEditor` to update walls, rooms, openings, standard doors and sliding doors. For example, `updateWall(wall, { width: 200 })` sets the width in millimetres. Distance updates use millimetres, and updates to multiple properties are validated before they are applied. The editor rejects objects outside the plan and invalid values without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify. Setting a default value explicitly is a change because it will be saved in the JSON.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Invalid values are reported in the window and do not change the plan.
