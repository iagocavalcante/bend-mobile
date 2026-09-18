import Base

type Node is Type:
  Text{text: String}
  Button{label: String, action: String}
  Column{children: List<Node>}
  Row{children: List<Node>}
