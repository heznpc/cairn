# DiagramDocument Patch Examples

Pass the latest full document as `document` and only changed fields as
`patch`. Use IDs copied from `document.map`.

## Relabel and hide

```json
{
  "patch": {
    "destinationLabel": "학생회관",
    "landmarks": {
      "node/101": { "label": "정문" },
      "node/205": { "hidden": true }
    }
  }
}
```

## Change composition and reproduction style

```json
{
  "patch": {
    "canvas": { "width": 800, "height": 500 },
    "render": { "template": "schematic", "theme": "mono" }
  }
}
```

## Set an explicit start landmark

Copy the ID from `document.map.landmarks`.

```json
{
  "patch": {
    "render": { "approachLandmarkId": "node/101" }
  }
}
```

Use `null` to return to automatic start selection.

## Move one marker

```json
{
  "patch": {
    "landmarks": {
      "node/101": {
        "position": { "x": 0.22, "y": 0.36 },
        "locked": true
      }
    }
  }
}
```

## Restore automatic behavior

Use `null` to remove an override and return to source data or automatic
placement.

```json
{
  "patch": {
    "destinationLabel": null,
    "landmarks": {
      "node/101": { "label": null, "position": null, "locked": null }
    }
  }
}
```
