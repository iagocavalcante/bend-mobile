import Base

# Applied independently to each input by native CPU threads or GPU invocations.
def compute(+x: U32) -> U32:
  ((x * x : U32) + 1 : U32)
