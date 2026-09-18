import Base
import ../mobile.bend as UI

type Model is Data:
  Model{count: U32, name: String, result: String}

def init() -> Model:
  Model{0, "", ""}

def routes() -> List<String>:
  ["home", "details"]

def schema() -> U32:
  1

# Compute results are transient; only the counter and name are durable.
def save(model: Model) -> String:
  match model:
    case Model{count, name, result}:
      U32.show(count) ++ "\n" ++ name

def restore_count(count: Maybe<&2, U32>, name: String) -> Maybe<Model>:
  match count:
    case Some{value}:
      Some{Model{value, name, ""}}
    case None{}:
      None{}

def restore_parts(parts: List<&2, String>) -> Maybe<Model>:
  match parts:
    case Con{count, Con{name, rest}}:
      restore_count(U32.read(count), String.join(name <> rest, "\n"))
    case _:
      None{}

def restore(saved: String) -> Maybe<Model>:
  restore_parts(String.split(saved, '\n'))

def increment(full: Bool, count: U32) -> U32:
  match full:
    case True{}:
      count
    case False{}:
      (count + 1 : U32)

def update(action: String, value: String, model: Model) -> Model:
  match action model:
    case "increment" Model{+count, name, result}:
      Model{increment(U32.is_eq(count, 4294967295), count), name, result}
    case "reset" Model{count, name, result}:
      Model{0, name, result}
    case "name" Model{count, name, result}:
      Model{count, value, result}
    case "computed" Model{count, name, result}:
      Model{count, name, value}
    case _ model:
      model

def view(route: String, model: Model) -> UI.Node:
  match route model:
    case "details" Model{count, name, result}:
      UI.Column{[
        UI.Text{"Details"},
        UI.Text{"Hello, " ++ name},
        UI.Text{"Count: " ++ U32.show(count)},
        UI.Compute{"Run on CPU", "computed", "cpu", [0, 1, 2, 3, 4294967295]},
        UI.Compute{"Run on GPU", "computed", "gpu", [0, 1, 2, 3, 4294967295]},
        UI.Text{"Result: " ++ result},
        UI.Back{"Back"}
      ]}
    case _ Model{count, name, result}:
      UI.Column{[
        UI.Text{"Bend Mobile"},
        UI.Input{"name", "Your name", name, "name"},
        UI.Text{"Count: " ++ U32.show(count)},
        UI.Row{[
          UI.Button{"Increment", "increment"},
          UI.Button{"Reset", "reset"}
        ]},
        UI.Link{"Details", "details"}
      ]}
