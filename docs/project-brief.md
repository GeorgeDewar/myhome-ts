# MyHome

## About this document

This document describes a mix of current and desired features and design attributes of MyHome. It will be used to inform development work.

## Background

This program allows creation and editing of a digital model of a house. This includes information about:

- Floors (levels)
- Walls
- Rooms
- Floor, wall and ceiling surfaces
- Electrical, plumbing, HVAC, telecommunications, etc (infrastructure)
- Landscaping

It is designed for houses that already exist, so its primary purpose is to document what is already there.

It is designed to store its data in a human-readable, version-controllable JSON file so that version control tools like Git can be used to keep track of changes over time.

The data captured will be renderable in 2D and 3D, and also exportable in tabular format, e.g. to support energy calculations. However this program itself will eventually include sophisticated energy calculations by allowing thermal properties to be captured (e.g. insulation status of walls, R-value on windows).

Other key features include:
- Capturing design alternatives (e.g. for an alteration, easily switch between current-state, Option 1 and Option 2), whether it's as small as different curtains, or as large as a whole new room
- Rendering the landscape around the house so you can see the view from the windows

Inspiration:
- Chief Architect Home Designer Suite
- Sweet Home 3D

## Data

Positional data will be stored in integer millimetres at rest, and in floating point metres in-memory for calculations. The origin is toward the top-left, with x increasing to the right and y increasing downwards. This is different from cartesian cooridinates, but in line with many 2D rendering tools.

### Schema

The data schema is defined in src/testData/schema.json. At a high level, the document is a site plan. It may contain buildings, which contain floors, and the floors contain walls and rooms. Outdoor features that are not part of buildings are top-level objects of the plan, e.g. fences.

### Walls

Walls are stored as a start and end position, and a thickness which includes the framing and cladding. The positions refer to the centreline of the wall.

#### Wall Sections

A wall can have sections along its length, which are specified by a starting and ending linear length along the wall (e.g. start: 0, end: 2135mm, meaning the first 2135mm from the start of the wall). This can be used when part of a wall has different properties from another part (possibly due to being part of a different room).

#### Wall openings

A wall opening, such as a doorframe or window frame, has a width and height equivalent to that of an object that could just fit through, in other words it's the internal size of the opening.

An opening can contain items such as doors and windows. These can be arranged, for example an opening may contain three windows in a column, a dividing post, and then one large window on the right.

### Rooms

Rooms are defined as a list of walls. The intersection points of these walls create the room geometry. This means room geometry can never be out of sync with wall positions.

## Home Designer importer

Plans can be imported from Home Designer, currently using a hacky process. The relevant code is in a different repo.

## Software architecture

This will be a TypeScript project so that it can be run as a web application, desktop-like application and also on mobile easily.

## Functionality

### 2D view

A floor can be viewed and edited as a 2D floor plan. Walls are drawn with solid yellow depicting the framing, and a thin black line depicting the cladding.

Openings are shown as a gap in the wall, and items within the openings are rendered, for example a window is shown as three lines.

Rooms have names and the name is shown as a label inside the room.

Underneath the plan, a 1mx1m grid is shown.

### 3D view

A 3D view can be created using the camera tool. Additionally, one is created by default, looking at the whole property from a suitable distance. All levels are shown at once in the 3D view.

A 1mx1m grid is shown at z=0.

### Plan Explorer

A hierachical list is shown called the Plan Explorer which includes every object in the plan, for example, every wall, every room, every door.

Clicking an object in the Plan Explorer highlights it on any 2D or 3D view, and selecting an object using the 2D or 3D view also highlights it in the Plan Explorer.

Double-clicking an item in the Explorer opens its Edit dialog. Right-clicking it shows the context menu for that item, which includes an Edit and a Delete option.

#### Level control

Clicking a level in the Plan Explorer switches the current view to show that level. The context menu for a level includes an opacity slider which allows a level to be shown with less than 100% opacity, overlaid with the actually-selected level. There can only be one "selected" level at any given time.

### Editing

A toolbar provides editing tools including:
- Create wall
- Create opening
- Create room (by clicking inside an enclosed space - eligible spaces will be highlighted)

If more than one room is selected, the context menu includes an option to merge them.

A selected wall can have its ends moved, or the whole wall can be moved laterally.

Every object with an attribute to edit can be opening by double-clicking it, or clicking it and pressing Enter. This will open its edit dialog.

#### Opening editor

The edit dialog for an opening is special. It shows a 2D and 3D representation of the opening and its contents, and provides tools to add, remove and position items in the opening.