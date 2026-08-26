import { type Document } from "../model/json/Document";

export const McKeefry: Document = {
  "$schema": "./json_schema.json",
  "buildings": [
    {
      "name": "Home",
      "floors": [
        {
          "number": 0,
          "name": "Downstairs",
          "ceilingHeight": 2420,
          "totalHeight": 2420,
          "walls": [],
          "rooms": []
        },
        {
          "number": 1,
          "name": "Upstairs",
          // "position": [0, 1776],
          "ceilingHeight": 2420,
          "totalHeight": 2420,
          "walls": [
            { "id": "eastWall", "start": [0, 0], "end": [12062, 0] },
            { "id": "northWall", "start": [12062, 0], "end": [12062, 7479] },
            { "id": "westWall", "start": [0, 7479], "end": [12062, 7479] },
            { "id": "southWall", "start": [0, 0], "end": [0, 7479] },
            {
              "id": "eastHallwayWall",
              "start": [0, 2840],
              "end": [8040, 2840]
            },
            {
              "id": "sophieBathInternalWall",
              "start": [3541, 0],
              "end": [3541, 2840]
            }
          ],
          "rooms": [
            {
              "name": "Sophie's Room",
              "walls": [
                { "ref": "eastWall" },
                { "ref": "eastHallwayWall" },
                { "ref": "southWall" }
              ]
            }
          ]
        },
        {
          "number": 2,
          "name": "Attic",
          "walls": [],
          "rooms": []
        }
      ]
    }
  ]
}
