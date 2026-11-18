# Every prop has a purpose

17 November 2026. Required for Town/Sky Lounge parity, including newly added props.
The current v0.3 actions are a foundation, not completion of this contract.

## Contract

Each catalog definition must declare stable identity, visible function, actions,
valid approach and exit, occupancy, animation/effects, cancellation, network
authority, persistent state and a measured render/simulation budget. Composite
models must expose their functional parts: a desk does not make its lamp functional,
and a dining table does not make its planter functional.

A useful action needs a visible result or usable state. A repeated timer followed
by a message is insufficient final coverage. An intentionally simple object can
support a simple action, but unfinished decoration must stay on the gap list.
Architecture surfaces belong to editing/material contracts; do not invent a fake
Use action for a wall or floor merely to inflate prop coverage.

## Generated-home inventory

| Object or component | v0.3 behavior | Required next work |
| --- | --- | --- |
| Bed | Reserved lying pose, clear approach and exit | Smooth getting in/out, bedding response and better resting animation |
| Sofa | A player can sit, read or eat a carried bowl of soup. The seat is exclusive across actions | Sit/stand transitions, cushion response and seating variants |
| Bookshelf/books | Read a visible book on the sofa | Select/return book, shelf reach animation, reading page motion |
| Stove/oven/pot | Cooking makes two saved portions of vegetable soup. Guests can take or return one bowl. The pot shows remaining soup | Stirring, heat controls and more recipes |
| Kitchen sink/tap | Sink-specific approach and picking, water flows from the tap, hands move together | Animate the handle and hands at the actual controls |
| Rug | Reserved stretching spot and arm motion | Coherent whole-body routine and transitions |
| Desk/paper | Timed writing pose with book/paper feedback | Desk-specific writing pose, pen motion and a retained visible page/result |
| Desk lamp | Click shade to switch, reach motion, glowing shade and tabletop light. State replicates and survives host reload | Add linked room switches and placement in the room editor |
| Dining table/chairs/plates | Two independently reservable chairs, carried bowls, spoon animation and one consumed portion per completed meal | Set the table, clear dishes and wash up |
| Table planter | Decorative | Water/tend response and inspectable plant state |
| Shower | Enter tray, wash under spray from shower head, return to clear floor | Animate the valve and entry transition |
| Toilet | Reserved seated use | Sit/stand, flush control and visible flush/reset state |
| Basin/mirror | Handwashing at a separate basin spout with animated stream | Valve animation and mirror function with bounded rendering cost |
| Nightstand/drawer | Decorative | Open/close drawer, supported contents and saved configuration |
| Bedside lamp | Independently saved switch, glowing shade and light pool | Add linked switches and placement in the room editor |
| Shelf planter | Decorative | Reachable tending interaction and visible response |
| Front door | Open doorway and Enter action | Door leaf interaction/animation without blocking routes or guests |
| Windows | Decorative glazing and cutaway visibility | Functional opening/blinds/curtains where modeled; correct room-edit behavior |

Existing venues also need the same audit for their lamps, equipment, instruments,
storage, food/drink props, plants and outdoor furniture. New prop definitions must
not bypass the contract because their geometry is small or their parent is usable.

## Acceptance scene

Two independent players enter an edited home while city residents continue outside.
They discover an object by clicking its visible part, contend for an exclusive use,
observe the same action/state, interrupt and leave safely, then move the object
through an owner-authorized edit. Reload restores persistent state; transient
occupancy clears on departure. No prop can be marked complete from a static render.
