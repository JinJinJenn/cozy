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

In v0.10.0, moving a sofa, bed, rug, desk, bedside table or dining set preserves
its activity slots. Dining chairs turn with the table. A lamp's shade, switch
target and light pool move with its support. A visitor can switch the relocated
desk lamp, and its state and position survive independent browser sessions.
Plumbing, shelves and wall televisions still have fixed positions.

| Object or component | Shipped behavior | Required next work |
| --- | --- | --- |
| Harbor Three board (v0.12) | Solo and two-player rounds share the real dining chairs with meals. Players place a buoy or ring on a modelled square. Pieces drop into place, guests can watch, and leaving the seat ends a shared round. Moving the dining set carries the board with it. | Additional tabletop games |
| Living-room television and remote (v0.6) | Two viewers share sofa cushions. A compact studio offers a second seat on the rug. Both viewers can tune or switch off the same animated picture. Each private home's channel survives owner reload. | More programs and room-editor placement |
| Bed | Reserved lying pose, clear approach and exit | Smooth getting in/out, bedding response and better resting animation |
| Sofa | A player can sit, read or eat a carried bowl of soup. The seat is exclusive across actions | Sit/stand transitions, cushion response and seating variants |
| Bookshelf/books | Read a visible book on the sofa | Select/return book, shelf reach animation, reading page motion |
| Stove/oven/pot | Cooking makes two saved portions of vegetable soup. Guests can take or return one bowl. The pot shows remaining soup | Stirring, heat controls and more recipes |
| Kitchen sink/tap | Sink-specific approach and picking, water flows from the tap, hands move together | Animate the handle and hands at the actual controls |
| Rug | Reserved stretching spot and arm motion | Coherent whole-body routine and transitions |
| Desk/paper | Timed writing pose with book/paper feedback | Desk-specific writing pose, pen motion and a retained visible page/result |
| Entry switch and lantern (v0.13) | Rocker and glass both operate the light. The paddle tilts and the lantern fades up over the threshold. The owner selects which lamps follow. Guests can operate it and use a second approach if someone is standing in the doorway. | Repositionable wall fixtures |
| Desk lamp | Click the shade to switch it independently, or link it to the entry switch. The lamp and light pool move with the desk. Guests see the change and the owner save retains it. | Placement on a different support |
| Dining table/chairs/plates | Two independently reservable chairs, carried bowls, spoon animation and one consumed portion per completed meal | Set the table, clear dishes and wash up |
| Table planter | Decorative | Water/tend response and inspectable plant state |
| Shower | Enter tray, wash under spray from shower head, return to clear floor | Animate the valve and entry transition |
| Toilet | Reserved seated use | Sit/stand, flush control and visible flush/reset state |
| Basin/mirror | Handwashing at a separate basin spout with animated stream | Valve animation and mirror function with bounded rendering cost |
| Nightstand/drawer | Decorative | Open/close drawer, supported contents and saved configuration |
| Bedside lamp | Switch the shade individually or use the entry switch. The room editor can unlink it so it stays on when someone turns out the hall light. Moving the bedside table carries the lamp and pool with it. | Placement on a different support |
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
