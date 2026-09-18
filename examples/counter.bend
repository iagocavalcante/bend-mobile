import Base
import ../mobile.bend as UI

def init() -> U32:
  0

def increment(full: Bool, count: U32) -> U32:
  match full:
    case True{}:
      count
    case False{}:
      (count + 1 : U32)

def update(action: String, +count: U32) -> U32:
  match action:
    case "increment":
      increment(U32.is_eq(count, 4294967295), count)
    case "reset":
      0
    case _:
      count

def view(count: U32) -> UI.Node:
  UI.Column{[
    UI.Text{"Bend Mobile"},
    UI.Text{"One Bend app. Two native platforms."},
    UI.Text{"Count: " ++ U32.show(count)},
    UI.Row{[
      UI.Button{"Increment", "increment"},
      UI.Button{"Reset", "reset"}
    ]}
  ]}
