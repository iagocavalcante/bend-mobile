import Base

type Node is Type:
  Text{text: String}
  Button{label: String, action: String}
  Input{key: String, label: String, value: String, action: String}
  Link{label: String, route: String}
  Back{label: String}
  Compute{label: String, action: String, backend: String, input: List<U32>}
  Column{children: List<Node>}
  Row{children: List<Node>}
