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
            vp
          ];

          shellHook = ''
            echo "WarEra devenv: node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo n/a)"
            if ! command -v vp >/dev/null 2>&1; then
              echo "Note: install Vite+ CLI with: curl -fsSL https://vite.plus | bash"
            fi

            # Vite+ (`vp`) ships as a local npm devDependency; use Nix's Node.js.
            if [ ! -x node_modules/.bin/vp ]; then
              echo "Installing npm dependencies (vite-plus / vp)..."
              npm install --no-fund --no-audit
            fi
            export PATH="$PWD/node_modules/.bin:$PATH"


          '';
        };
      }
    );
}
