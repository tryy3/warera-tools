{
  description = "WarEra personal toolkit";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs { inherit system; };

      in {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            turso-cli
            nodejs_26
            pnpm
            # Do NOT add nixpkgs `vp` here — that package is an SDL image viewer
            # (erikg/vp), not Vite+. Vite+ comes from the local vite-plus dep.
          ];

          shellHook = ''
            echo "WarEra devenv: node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo n/a)"

            # Vite+ (`vp`) ships as a local pnpm dependency; put it first on PATH.
            # Never add nixpkgs `vp` to buildInputs — that is an unrelated SDL image viewer.
            if [ ! -x node_modules/.bin/vp ]; then
              echo "Installing dependencies (vite-plus / vp)..."
              pnpm install
            fi
            export PATH="$PWD/node_modules/.bin:$PATH"

            if [ ! -x node_modules/.bin/vp ]; then
              echo "Warning: node_modules/.bin/vp missing after install — check vite-plus in package.json"
            fi
          '';
        };
      }
    );
}
