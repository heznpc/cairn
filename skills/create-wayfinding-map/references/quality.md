# Wayfinding Quality

Use this order of importance. Never trade a higher item for a lower one.

1. **Route legibility**: Preserve a continuous road or approach cue from the
   strongest start landmark toward the destination.
2. **Destination hierarchy**: Make the destination the first visual focus;
   keep its callout readable and unambiguous.
3. **Marker clearance**: Keep marker discs and opaque labels out of protected
   road corridors. A leader may connect a displaced marker to its anchor.
4. **Label clarity**: Avoid label-label, label-marker, and label-road overlap.
   Prefer a shorter truthful label or hide a weak landmark.
5. **Information economy**: Retain only landmarks that help someone orient or
   make a decision. Decorative POIs are expendable.
6. **Output integrity**: Keep content inside the canvas and retain visible OSM
   attribution when OSM data is used.

## Template Selection

| Template | Use it for |
|---|---|
| `standard` | General campus, venue, business-card, and flyer maps |
| `compact` | Small inserts where transit and the final approach matter most |
| `minimal` | A simple start-to-destination route strip |
| `schematic` | Dense or irregular streets that read better as right-angle axes |
| `badge` | A small destination-first inset inside another design |

## Theme Selection

| Theme | Use it for |
|---|---|
| `paper` | Default print output and neutral documents |
| `mono` | Black-and-white printing and maximum reproduction reliability |
| `civic` | Campuses, public facilities, and operational signage |
| `invitation` | Invitations and softer editorial contexts |

## Revision Heuristics

- Hide low-importance shops before transit, gates, schools, hospitals, or
  distinctive civic landmarks.
- Preserve a named primary road before unnamed tertiary or residential roads.
- Change template when composition is wrong; change theme only when visual
  tone or reproduction requirements are wrong.
- Move a marker manually only after automatic placement visibly fails. Keep
  normalized positions within `0..1` and reinspect the road corridor.
- Use `mono` when color contrast or print conditions are uncertain.
- Never infer a private entrance, indoor connection, or game-world route from
  geographic proximity alone.
