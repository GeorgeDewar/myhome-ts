
### Editing walls

Use `PlanEditor.updateWall(wall, { width: 200 })` to edit a wall's width in millimetres. It rejects walls outside the plan and invalid widths without changing the model, returning an error for the caller to display. Successful changes notify the editor's `onChange` callback once; unchanged explicit values do not notify. Setting the default width explicitly is a change because it will be saved in the JSON.

Property windows hold changes locally until Apply or OK is pressed. Apply keeps the window open; OK closes it after a successful update. Closing the window without applying discards its draft. Invalid values are reported in the window and do not change the plan.
