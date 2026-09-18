import Base

def square(+x: U32) -> U32:
  (x * x : U32)

# Applied independently to each input by native CPU threads or GPU invocations.
def compute(x: U32) -> U32:
  squared = square(x)
  (squared + 1 : U32)
