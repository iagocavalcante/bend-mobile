import Base

def square(+x: U32) -> U32:
  (x * x : U32)

def square_or_max(overflow: Bool, x: U32) -> U32:
  match overflow:
    case True{}:
      4294967295
    case False{}:
      squared = square(x)
      (squared + 1 : U32)

# Saturating square + 1, applied independently to each input on CPU or GPU.
def compute(+x: U32) -> U32:
  square_or_max(U32.is_gt(x, 65535), x)
