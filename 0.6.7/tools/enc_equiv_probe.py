import dis, sys
print(sys.version)
srcs = {
 "A_continue": "for k in xs:\n    if k not in item:\n        continue\n    use(k)\n",
 "B_in_pass_else_continue":  "for k in xs:\n    if k in item:\n        pass\n    else:\n        continue\n    use(k)\n",
 "C_in_guard": "for k in xs:\n    if k in item:\n        use(k)\n",
 "D_notin_inline": "for k in xs:\n    if k not in item: continue\n    use(k)\n",
 "E_cmp_ne_continue": "for k in xs:\n    if k != 1:\n        continue\n    use(k)\n",
 "F_cmp_eq_guard": "for k in xs:\n    if k == 1:\n        use(k)\n",
 "G_ret_false": "def f(k, item):\n    if k not in item:\n        return False\n    return True\n",
 "H_in_else_ret": "def f(k, item):\n    if k in item:\n        return True\n    return False\n",
}
for name, s in srcs.items():
    print("=====", name)
    code = compile(s, "<t>", "exec")
    for i in dis.get_instructions(code, show_caches=False):
        if i.opname in ("CONTAINS_OP","COMPARE_OP","POP_JUMP_IF_TRUE","POP_JUMP_IF_FALSE","JUMP_BACKWARD","IS_OP","RETURN_CONST","RETURN_VALUE","POP_JUMP_FORWARD_IF_TRUE","POP_JUMP_FORWARD_IF_FALSE","POP_JUMP_BACKWARD_IF_TRUE","POP_JUMP_BACKWARD_IF_FALSE"):
            print("   ", i.opname, i.argrepr)
